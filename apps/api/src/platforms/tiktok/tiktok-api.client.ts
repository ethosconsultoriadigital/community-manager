import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_OAUTH_SCOPES,
  TIKTOK_REVOKE_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_USER_INFO_URL,
  type TikTokTokenResponse,
  type TikTokUserInfo,
} from './tiktok.types';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class TikTokApiClient {
  private readonly logger = new Logger(TikTokApiClient.name);

  constructor(private readonly config: ConfigService) {}

  buildOAuthUrl(redirectUri: string, state: string): string {
    const clientKey = this.requireClientKey();
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: [...TIKTOK_OAUTH_SCOPES].join(','),
      redirect_uri: redirectUri,
      state,
    });
    return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<TikTokTokenResponse> {
    return this.requestToken({
      client_key: this.requireClientKey(),
      client_secret: this.requireClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
    return this.requestToken({
      client_key: this.requireClientKey(),
      client_secret: this.requireClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
    const fields = 'open_id,union_id,avatar_url,display_name';
    const url = `${TIKTOK_USER_INFO_URL}?fields=${encodeURIComponent(fields)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await this.readJson(response)) as {
      data?: { user?: TikTokUserInfo };
      error?: { code?: string; message?: string; log_id?: string };
    };
    if (!response.ok) {
      this.logger.error(
        `TikTok user/info error: status=${response.status} body=${this.sanitizeForLog(body as JsonRecord)}`,
      );
      throw new Error(
        `No se pudo obtener perfil TikTok: HTTP ${response.status}`,
      );
    }
    const user = body.data?.user;
    if (!user?.open_id) {
      throw new Error('TikTok no devolvió open_id en user/info');
    }
    return user;
  }

  async revokeToken(accessToken: string): Promise<void> {
    const response = await fetch(TIKTOK_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.requireClientKey(),
        client_secret: this.requireClientSecret(),
        token: accessToken,
      }),
    });
    const body = (await this.readJson(response)) as TikTokTokenResponse;
    if (!response.ok || body.error) {
      this.logger.warn(
        `TikTok revoke: status=${response.status} error=${body.error ?? 'n/a'} log_id=${body.log_id ?? 'n/a'}`,
      );
    }
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<TikTokTokenResponse> {
    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const json = (await this.readJson(response)) as TikTokTokenResponse;
    if (!response.ok || json.error || !json.access_token) {
      this.logger.error(
        `TikTok token error: status=${response.status} body=${this.sanitizeForLog(json as JsonRecord)}`,
      );
      const detail =
        json.error_description ?? json.error ?? `HTTP ${response.status}`;
      throw new Error(`No se pudo obtener token de TikTok: ${detail}`);
    }
    return json;
  }

  private requireClientKey(): string {
    const key = this.config.get<string>('TIKTOK_CLIENT_KEY')?.trim();
    if (!key) throw new Error('TIKTOK_CLIENT_KEY no está definida');
    return key;
  }

  private requireClientSecret(): string {
    const secret = this.config.get<string>('TIKTOK_CLIENT_SECRET')?.trim();
    if (!secret) throw new Error('TIKTOK_CLIENT_SECRET no está definida');
    return secret;
  }

  private async readJson(response: Response): Promise<JsonRecord> {
    try {
      return (await response.json()) as JsonRecord;
    } catch {
      return {};
    }
  }

  private sanitizeForLog(body: JsonRecord): string {
    const copy = { ...body };
    for (const key of [
      'access_token',
      'refresh_token',
      'code',
      'client_secret',
      'token',
    ]) {
      if (key in copy) copy[key] = '[redacted]';
    }
    try {
      return JSON.stringify(copy).slice(0, 500);
    } catch {
      return '[unserializable]';
    }
  }
}
