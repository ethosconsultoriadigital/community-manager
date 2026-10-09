import type {
  GenerateAvatarFromBriefResult,
  GenerateReelFromBriefResult,
} from './types';

const DIRECT_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/**
 * En el browser usamos proxy same-origin (/api-backend) vía next.config rewrites.
 * En SSR (servidor Next) hablamos directo a la API.
 */
function getApiBase(): string {
  if (typeof window !== 'undefined') {
    return '/api-backend';
  }
  return DIRECT_API_URL;
}

/** Polling UI: fal multi-escena / lip-sync puede superar 10–15 min. */
const DEFAULT_VIDEO_POLL_TIMEOUT_MS = 25 * 60 * 1000;
const DEFAULT_VIDEO_POLL_INTERVAL_MS = 4000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Evita mostrar "[object Object]" cuando Nest/fal devuelven message como objeto. */
export function formatApiErrorMessage(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatApiErrorMessage(item))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    if (typeof rec.msg === 'string') return rec.msg;
    try {
      return JSON.stringify(value).slice(0, 400);
    } catch {
      return 'Error desconocido';
    }
  }
  return String(value);
}

function readErrorMessage(body: { message?: unknown; error?: unknown }, fallback: string): string {
  return (
    formatApiErrorMessage(body.message) ||
    formatApiErrorMessage(body.error) ||
    fallback
  );
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cm_access_token');
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('cm_access_token', token);
  else localStorage.removeItem('cm_access_token');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const authToken = token ?? getStoredToken();
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();
  // No forzar Content-Type en GET (evita preflight innecesario si se usa API directa).
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const url = `${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : '';
    throw new ApiError(
      `No se pudo conectar con la API (${url}). ${
        detail ? `(${detail}) ` : ''
      }Si estás generando Reel/Avatar, la API puede estar ocupada: espera y reintenta, o revisa logs de Render.`,
      0,
    );
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Polling de generación: los fallos de red NO abortan el job.
 * Render a menudo deja de responder HTTP mientras corre fal/ffmpeg en el mismo proceso.
 */
async function pollVideoJob<TResult>(options: {
  path: string;
  label: string;
  intervalMs?: number;
  timeoutMs?: number;
  token?: string | null;
  pickResult: (status: {
    status: string;
    error?: string;
    result?: TResult;
  }) => TResult | undefined;
}): Promise<TResult> {
  const intervalMs = options.intervalMs ?? DEFAULT_VIDEO_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_VIDEO_POLL_TIMEOUT_MS;
  const started = Date.now();
  let consecutiveNetworkErrors = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const status = await apiFetch<{
        status: string;
        error?: string;
        result?: TResult;
      }>(options.path, {}, options.token);
      consecutiveNetworkErrors = 0;

      if (status.status === 'completed') {
        const result = options.pickResult(status);
        if (result) return result;
        throw new ApiError(`${options.label} completado sin resultado`, 500);
      }
      if (status.status === 'failed') {
        throw new ApiError(status.error ?? `Error al generar ${options.label}`, 500);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        consecutiveNetworkErrors += 1;
        // Sigue esperando: el worker puede seguir vivo aunque HTTP falle un rato.
        await new Promise((r) => setTimeout(r, Math.min(15_000, intervalMs * consecutiveNetworkErrors)));
        continue;
      }
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new ApiError(
    `${options.label} sigue generándose. Revisa Aprobaciones en unos minutos (el job puede seguir en el servidor aunque la conexión se haya cortado).`,
    408,
  );
}

/** Polling de job de avatar (BullMQ). Timeout por defecto ~25 min. */
export async function pollAvatarJob(
  generationId: string,
  options?: { intervalMs?: number; timeoutMs?: number; token?: string | null },
): Promise<GenerateAvatarFromBriefResult> {
  return pollVideoJob<GenerateAvatarFromBriefResult>({
    path: `/generations/avatar/${generationId}`,
    label: 'El avatar',
    intervalMs: options?.intervalMs,
    timeoutMs: options?.timeoutMs,
    token: options?.token,
    pickResult: (s) => s.result,
  });
}

/** Polling de job de Reel (BullMQ). Timeout por defecto ~25 min. */
export async function pollReelJob(
  generationId: string,
  options?: { intervalMs?: number; timeoutMs?: number; token?: string | null },
): Promise<GenerateReelFromBriefResult> {
  return pollVideoJob<GenerateReelFromBriefResult>({
    path: `/generations/reel/${generationId}`,
    label: 'El Reel',
    intervalMs: options?.intervalMs,
    timeoutMs: options?.timeoutMs,
    token: options?.token,
    pickResult: (s) => s.result,
  });
}

export async function apiUploadMedia<T>(
  postId: string,
  file: File,
  token?: string | null,
): Promise<T> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${getApiBase()}/posts/${postId}/media`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

/** Personaje estilizado del cliente (avatar / lip-sync). */
export async function apiUploadClientCharacter(
  clientId: string,
  file: File,
  token?: string | null,
): Promise<{ characterImageUrl: string; brand: Record<string, unknown> }> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${getApiBase()}/clients/${clientId}/character`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<{
    characterImageUrl: string;
    brand: Record<string, unknown>;
  }>;
}

/** Logo de marca del cliente: NO pasa por parse-reference ni OpenAI. */
export async function apiUploadClientLogo(
  clientId: string,
  file: File,
  token?: string | null,
): Promise<{ logoUrl: string; brand: Record<string, unknown> }> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${getApiBase()}/clients/${clientId}/logo`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<{
    logoUrl: string;
    brand: Record<string, unknown>;
  }>;
}

export async function apiUploadReference<T>(
  file: File,
  token?: string | null,
): Promise<T> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${getApiBase()}/generations/parse-reference`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export async function apiUploadStandaloneImage(
  file: File,
  token?: string | null,
): Promise<{ storageUrl: string; type: 'image' }> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${getApiBase()}/media/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      message = readErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<{ storageUrl: string; type: 'image' }>;
}
