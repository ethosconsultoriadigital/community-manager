import type { AvatarJobStatusResult, GenerateAvatarFromBriefResult } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    const hint =
      API_URL.includes('localhost') || API_URL.includes('127.0.0.1')
        ? 'En Vercel configura NEXT_PUBLIC_API_URL=https://community-manager-api.onrender.com y vuelve a hacer Redeploy.'
        : `Revisa que la API responda en ${API_URL}/health y que FRONTEND_URL en Render coincida con la URL de Vercel (CORS).`;
    throw new ApiError(
      `No se pudo conectar con la API (${API_URL}). ${hint}`,
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

/** Polling de job de avatar (BullMQ). Timeout por defecto ~12 min. */
export async function pollAvatarJob(
  generationId: string,
  options?: { intervalMs?: number; timeoutMs?: number; token?: string | null },
): Promise<GenerateAvatarFromBriefResult> {
  const intervalMs = options?.intervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 12 * 60 * 1000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const status = await apiFetch<AvatarJobStatusResult>(
      `/generations/avatar/${generationId}`,
      {},
      options?.token,
    );
    if (status.status === 'completed' && status.result) {
      return status.result;
    }
    if (status.status === 'failed') {
      throw new ApiError(status.error ?? 'Error al generar el avatar', 500);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new ApiError(
    'El avatar sigue generándose y superó el tiempo de espera. Revisa Aprobaciones en unos minutos.',
    408,
  );
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

  const res = await fetch(`${API_URL}/posts/${postId}/media`, {
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

export async function apiUploadReference<T>(file: File, token?: string | null): Promise<T> {
  const authToken = token ?? getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const headers = new Headers();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(`${API_URL}/generations/parse-reference`, {
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

  const res = await fetch(`${API_URL}/clients/${clientId}/character`, {
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

  const res = await fetch(`${API_URL}/clients/${clientId}/logo`, {
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

  return res.json() as Promise<{ logoUrl: string; brand: Record<string, unknown> }>;
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

  const res = await fetch(`${API_URL}/media/upload`, {
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
