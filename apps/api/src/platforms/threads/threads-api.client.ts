import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  THREADS_API_VERSION,
  type ThreadsProfile,
  type ThreadsTokenResponse,
} from './threads.types';

@Injectable()
export class ThreadsApiClient {
  private readonly logger = new Logger(ThreadsApiClient.name);
  private readonly graphBase = `https://graph.threads.net/${THREADS_API_VERSION}`;
  /** Esperas entre reintentos de threads_publish cuando el contenedor aún no está listo. */
  publishRetryDelaysMs: number[] = [5000, 10000, 20000];

  constructor(private readonly config: ConfigService) {}

  buildOAuthUrl(redirectUri: string, scopes: string[], state: string): string {
    const appId = this.requireConfig('THREADS_APP_ID');
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes.join(','),
      response_type: 'code',
      state,
    });
    return `https://threads.com/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<ThreadsTokenResponse> {
    const appId = this.requireConfig('THREADS_APP_ID');
    const appSecret = this.requireConfig('THREADS_APP_SECRET');
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    return this.postForm<ThreadsTokenResponse>(
      'https://graph.threads.net/oauth/access_token',
      body,
    );
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<ThreadsTokenResponse> {
    const appSecret = this.requireConfig('THREADS_APP_SECRET');
    const params = new URLSearchParams({
      grant_type: 'th_exchange_token',
      client_secret: appSecret,
      access_token: shortLivedToken,
    });
    return this.getJson<ThreadsTokenResponse>(
      `https://graph.threads.net/access_token?${params}`,
    );
  }

  async refreshLongLivedToken(currentToken: string): Promise<ThreadsTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: currentToken,
    });
    return this.getJson<ThreadsTokenResponse>(
      `https://graph.threads.net/refresh_access_token?${params}`,
    );
  }

  async getMe(accessToken: string): Promise<ThreadsProfile> {
    const params = new URLSearchParams({
      fields: 'id,username',
      access_token: accessToken,
    });
    return this.getJson<ThreadsProfile>(`${this.graphBase}/me?${params}`);
  }

  async createTextContainer(
    userId: string,
    accessToken: string,
    text: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'TEXT',
      text,
      access_token: accessToken,
    });
    return this.postForm<{ id: string }>(`${this.graphBase}/${userId}/threads`, params);
  }

  async createImageContainer(
    userId: string,
    accessToken: string,
    imageUrl: string,
    text: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'IMAGE',
      image_url: imageUrl,
      text,
      access_token: accessToken,
    });
    return this.postForm<{ id: string }>(`${this.graphBase}/${userId}/threads`, params);
  }

  async createVideoContainer(
    userId: string,
    accessToken: string,
    videoUrl: string,
    text: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'VIDEO',
      video_url: videoUrl,
      text,
      access_token: accessToken,
    });
    return this.postForm<{ id: string }>(`${this.graphBase}/${userId}/threads`, params);
  }

  async waitForContainer(
    containerId: string,
    accessToken: string,
    opts: { maxAttempts?: number; delayMs?: number } = {},
  ): Promise<void> {
    const maxAttempts = opts.maxAttempts ?? 30;
    const delayMs = opts.delayMs ?? 2000;
    for (let i = 0; i < maxAttempts; i++) {
      const params = new URLSearchParams({
        fields: 'status,error_message',
        access_token: accessToken,
      });
      const status = await this.getJson<{
        status?: string;
        error_message?: string;
      }>(`${this.graphBase}/${containerId}?${params}`);

      if (status.status === 'FINISHED') return;
      if (status.status === 'ERROR' || status.status === 'EXPIRED') {
        throw new Error(
          status.error_message ?? `Contenedor Threads en estado ${status.status}`,
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error('Timeout esperando contenedor Threads');
  }

  async publishContainer(
    userId: string,
    accessToken: string,
    creationId: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });
    // Meta recomienda esperar tras crear el contenedor: aunque diga FINISHED,
    // threads_publish a veces responde "The requested resource does not exist"
    // (code 24 / 4279009) unos segundos. Se reintenta solo ese caso.
    const delays = this.publishRetryDelaysMs;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.postForm<{ id: string }>(
          `${this.graphBase}/${userId}/threads_publish`,
          params,
        );
      } catch (error) {
        if (attempt >= delays.length || !isThreadsMediaNotReadyError(error)) throw error;
        this.logger.warn(
          `threads_publish: contenedor aún no disponible; reintento ${attempt + 1}/${delays.length} en ${delays[attempt]} ms`,
        );
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new Error(`${key} no está definida`);
    return value;
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!res.ok) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(
        `Threads GET falló ${describeEndpoint(url)} code=${body.error?.code ?? '-'} subcode=${body.error?.error_subcode ?? '-'}: ${msg}`,
      );
      const err = new Error(msg) as ThreadsError;
      if (typeof body.error?.code === 'number') err.code = body.error.code;
      if (typeof body.error?.error_subcode === 'number') err.subcode = body.error.error_subcode;
      throw err;
    }
    return body;
  }

  private async postForm<T>(url: string, params: URLSearchParams): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!res.ok) {
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(
        `Threads POST falló ${describeEndpoint(url)} code=${body.error?.code ?? '-'} subcode=${body.error?.error_subcode ?? '-'}: ${msg}`,
      );
      const err = new Error(msg) as ThreadsError;
      if (typeof body.error?.code === 'number') err.code = body.error.code;
      if (typeof body.error?.error_subcode === 'number') err.subcode = body.error.error_subcode;
      throw err;
    }
    return body;
  }
}

type ThreadsError = Error & { code?: number; subcode?: number };

/** Solo el último segmento del path (p. ej. threads_publish), nunca la query con el token. */
function describeEndpoint(url: string): string {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean);
    return `[${path[path.length - 1] ?? ''}]`;
  } catch {
    return '';
  }
}

/** Contenedor creado pero aún no visible para threads_publish. */
export function isThreadsMediaNotReadyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { subcode } = error as ThreadsError;
  if (subcode === 4279009) return true;
  return /requested resource does not exist|media not found/i.test(error.message);
}
