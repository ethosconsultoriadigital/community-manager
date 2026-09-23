import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  X_API_BASE,
  X_AUTHORIZE_URL,
  X_TOKEN_URL,
  type XProfile,
  type XTokenResponse,
  type XTweetCreateResponse,
} from './x.types';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class XApiClient {
  private readonly logger = new Logger(XApiClient.name);

  constructor(private readonly config: ConfigService) {}

  buildOAuthUrl(
    redirectUri: string,
    scopes: readonly string[],
    state: string,
    codeChallenge: string,
  ): string {
    const clientId = this.requireClientId();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${X_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<XTokenResponse> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: this.requireClientId(),
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<XTokenResponse> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.requireClientId(),
    });
  }

  async getMe(accessToken: string): Promise<XProfile> {
    const params = new URLSearchParams({
      'user.fields': 'id,username,name',
    });
    const response = await fetch(`${X_API_BASE}/users/me?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await this.readJson(response)) as {
      data?: XProfile;
      errors?: Array<{ detail?: string; title?: string; message?: string }>;
    };
    if (!response.ok || !body.data?.id) {
      throw new Error(this.formatApiError('obtener perfil', response.status, body));
    }
    return body.data;
  }

  async createTweet(
    accessToken: string,
    text: string,
    inReplyToTweetId?: string,
  ): Promise<{ id: string }> {
    const payload: Record<string, unknown> = { text };
    if (inReplyToTweetId) {
      payload.reply = { in_reply_to_tweet_id: inReplyToTweetId };
    }

    const response = await fetch(`${X_API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = (await this.readJson(response)) as XTweetCreateResponse;
    if (!response.ok || !body.data?.id) {
      throw new Error(this.formatApiError('publicar tweet', response.status, body));
    }
    return { id: body.data.id };
  }

  private async requestToken(body: Record<string, string>): Promise<XTokenResponse> {
    const clientId = this.requireClientId();
    const clientSecret = this.requireClientSecret();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });

    const json = (await this.readJson(response)) as XTokenResponse & {
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !json.access_token) {
      const detail =
        json.error_description ?? json.error ?? `HTTP ${response.status}`;
      this.logger.error('Error en token X (sin exponer tokens)');
      throw new Error(`No se pudo obtener token de X: ${detail}`);
    }
    return json;
  }

  private requireClientId(): string {
    const id = this.config.get<string>('X_CLIENT_ID')?.trim();
    if (!id) throw new Error('X_CLIENT_ID no está definida');
    return id;
  }

  private requireClientSecret(): string {
    const secret = this.config.get<string>('X_CLIENT_SECRET')?.trim();
    if (!secret) throw new Error('X_CLIENT_SECRET no está definida');
    return secret;
  }

  private async readJson(response: Response): Promise<JsonRecord> {
    try {
      return (await response.json()) as JsonRecord;
    } catch {
      return {};
    }
  }

  private formatApiError(action: string, status: number, body: JsonRecord): string {
    const errors = body.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { detail?: string; title?: string; message?: string };
      const msg = first.detail ?? first.message ?? first.title;
      if (msg) return `No se pudo ${action}: ${msg}`;
    }
    if (typeof body.detail === 'string') return `No se pudo ${action}: ${body.detail}`;
    if (typeof body.title === 'string') return `No se pudo ${action}: ${body.title}`;
    return `No se pudo ${action}: HTTP ${status}`;
  }
}
