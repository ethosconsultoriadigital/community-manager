import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsRepository, SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { encryptToken } from '@cm/shared';
import { createHash, randomBytes } from 'node:crypto';
import { ClientAccessService } from '../../access/client-access.service';
import { isXPublishEnabled } from '../platform-features';
import { XApiClient } from './x-api.client';
import { XOAuthStateStore } from './x-oauth-state.store';
import { X_OAUTH_SCOPES, XOAuthStateInvalidError } from './x.types';

@Injectable()
export class XOAuthService {
  private readonly logger = new Logger(XOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly x: XApiClient,
    private readonly stateStore: XOAuthStateStore,
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
    const state = randomBytes(32).toString('base64url');
    const redirectUri = this.getRedirectUri();

    await this.stateStore.save(state, {
      userId: user.id,
      agencyId: user.agencyId,
      clientId,
      codeVerifier,
    });

    return this.x.buildOAuthUrl(
      redirectUri,
      [...X_OAUTH_SCOPES],
      state,
      codeChallenge,
    );
  }

  async handleCallback(code: string, state: string) {
    this.assertEnabled();

    const pending = await this.stateStore.consume(state);
    if (!pending) {
      throw new XOAuthStateInvalidError(this.getStateErrorRedirectUrl());
    }

    await this.assertClientBelongsToAgency(pending.agencyId, pending.clientId);

    const redirectUri = this.getRedirectUri();
    let tokens;
    try {
      tokens = await this.x.exchangeCodeForToken(
        code,
        redirectUri,
        pending.codeVerifier,
      );
    } catch (error) {
      this.logger.warn(
        `Callback OAuth X: fallo intercambio de token (${error instanceof Error ? error.message : 'error'})`,
      );
      throw error;
    }

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
      agencyId: pending.agencyId,
      clientId: pending.clientId,
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
      agencyId: pending.agencyId,
      clientId: pending.clientId,
      accounts: [account],
    };
  }

  getSuccessRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?connected=x`;
  }

  getStateErrorRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?error=x_oauth_state`;
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
