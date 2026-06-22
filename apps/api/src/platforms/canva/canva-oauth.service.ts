import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AgenciesRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { encryptToken } from '@cm/shared';
import { createHash, randomBytes } from 'node:crypto';
import { CanvaConnectClient } from './canva-connect.client';
import {
  CANVA_AUTHORIZE_URL,
  CANVA_OAUTH_SCOPES,
  type CanvaOAuthState,
} from './canva.types';

@Injectable()
export class CanvaOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly agencies: AgenciesRepository,
    private readonly canva: CanvaConnectClient,
  ) {}

  async startConnect(user: AuthUser): Promise<string> {
    this.requireClientCredentials();

    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const redirectUri = this.getRedirectUri();

    const state = this.jwt.sign(
      {
        sub: user.id,
        agencyId: user.agencyId,
        codeVerifier,
        nonce: randomBytes(16).toString('hex'),
      } satisfies CanvaOAuthState,
      { expiresIn: '15m' },
    );

    const params = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 's256',
      scope: [...CANVA_OAUTH_SCOPES].join(' '),
      response_type: 'code',
      client_id: this.config.get<string>('CANVA_CLIENT_ID')!,
      state,
      redirect_uri: redirectUri,
    });

    return `${CANVA_AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string) {
    const payload = this.verifyState(state);
    const redirectUri = this.getRedirectUri();
    const tokens = await this.canva.exchangeAuthorizationCode(
      code,
      payload.codeVerifier,
      redirectUri,
    );

    const encryptionKey = this.requireEncryptionKey();
    await this.agencies.updateCanvaTokens(payload.agencyId, {
      accessTokenEnc: encryptToken(tokens.access_token, encryptionKey),
      refreshTokenEnc: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, encryptionKey)
        : null,
      expiresAt: this.expiresAtFromSeconds(tokens.expires_in),
    });

    return { agencyId: payload.agencyId };
  }

  async getStatus(agencyId: string) {
    const agency = await this.agencies.findByIdWithCanvaTokens(agencyId);
    return {
      configured: this.isConfigured(),
      connected: Boolean(agency?.canva_access_token_enc),
    };
  }

  getSuccessRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/composer?connected=canva`;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CANVA_CLIENT_ID') &&
        this.config.get<string>('CANVA_CLIENT_SECRET'),
    );
  }

  private verifyState(state: string): CanvaOAuthState {
    try {
      return this.jwt.verify<CanvaOAuthState>(state);
    } catch {
      throw new BadRequestException('State OAuth de Canva inválido o expirado');
    }
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('CANVA_REDIRECT_URI');
    if (!uri) throw new Error('CANVA_REDIRECT_URI no está definida');
    return uri;
  }

  private requireClientCredentials(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException('Integración Canva no configurada en el servidor');
    }
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }

  private expiresAtFromSeconds(expiresIn?: number): Date | null {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000);
  }
}
