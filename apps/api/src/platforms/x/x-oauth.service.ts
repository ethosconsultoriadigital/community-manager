import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientsRepository, SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { encryptToken } from '@cm/shared';
import { createHash, randomBytes } from 'node:crypto';
import { ClientAccessService } from '../../access/client-access.service';
import { isXPublishEnabled } from '../platform-features';
import { XApiClient } from './x-api.client';
import { X_OAUTH_SCOPES, type XOAuthState } from './x.types';

@Injectable()
export class XOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly x: XApiClient,
    private readonly clients: ClientsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  assertEnabled() {
    if (!isXPublishEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'X no está habilitado. Configura X_PUBLISH_ENABLED y credenciales.',
      );
    }
  }

  isEnabled(): boolean {
    return isXPublishEnabled(this.config);
  }

  async startConnect(user: AuthUser, clientId: string): Promise<string> {
    this.assertEnabled();
    await this.assertClientBelongsToAgency(user.agencyId, clientId);
    await this.clientAccess.assertClientAccess(user, clientId);

    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const redirectUri = this.getRedirectUri();

    const state = this.jwt.sign(
      {
        sub: user.id,
        agencyId: user.agencyId,
        clientId,
        codeVerifier,
        nonce: randomBytes(16).toString('hex'),
      } satisfies XOAuthState,
      { expiresIn: '15m' },
    );

    return this.x.buildOAuthUrl(
      redirectUri,
      [...X_OAUTH_SCOPES],
      state,
      codeChallenge,
    );
  }

  async handleCallback(code: string, state: string) {
    this.assertEnabled();
    const payload = this.verifyState(state);
    await this.assertClientBelongsToAgency(payload.agencyId, payload.clientId);

    const redirectUri = this.getRedirectUri();
    const tokens = await this.x.exchangeCodeForToken(
      code,
      redirectUri,
      payload.codeVerifier,
    );
    const profile = await this.x.getMe(tokens.access_token);

    if (!profile.id) {
      throw new BadRequestException('No se pudo obtener el perfil de X');
    }

    const encryptionKey = this.requireEncryptionKey();
    const tokenExpiresAt = this.expiresAtFromSeconds(tokens.expires_in);
    const scopes = tokens.scope
      ? tokens.scope.split(/\s+/).filter(Boolean)
      : [...X_OAUTH_SCOPES];

    const account = await this.socialAccounts.upsert({
      agencyId: payload.agencyId,
      clientId: payload.clientId,
      platform: 'x',
      externalAccountId: String(profile.id),
      username: profile.username ?? null,
      accessTokenEnc: encryptToken(tokens.access_token, encryptionKey),
      refreshTokenEnc: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, encryptionKey)
        : null,
      tokenExpiresAt,
      scopes,
    });

    return {
      agencyId: payload.agencyId,
      clientId: payload.clientId,
      accounts: [account],
    };
  }

  getSuccessRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?connected=x`;
  }

  private verifyState(state: string): XOAuthState {
    try {
      return this.jwt.verify<XOAuthState>(state);
    } catch {
      throw new BadRequestException('State OAuth de X inválido o expirado');
    }
  }

  private async assertClientBelongsToAgency(agencyId: string, clientId: string) {
    const client = await this.clients.findById(agencyId, clientId);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('X_REDIRECT_URI');
    if (!uri) throw new Error('X_REDIRECT_URI no está definida');
    return uri;
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
