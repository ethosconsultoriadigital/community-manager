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
import { randomBytes } from 'node:crypto';
import { ClientAccessService } from '../../access/client-access.service';
import { isTikTokPublishEnabled } from '../platform-features';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokOAuthStateStore } from './tiktok-oauth-state.store';
import {
  TIKTOK_OAUTH_SCOPES,
  TIKTOK_REQUIRED_SCOPES,
  TikTokOAuthStateInvalidError,
} from './tiktok.types';

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tiktok: TikTokApiClient,
    private readonly stateStore: TikTokOAuthStateStore,
    private readonly clients: ClientsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  assertEnabled() {
    if (!isTikTokPublishEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'TikTok no está habilitado. Configura TIKTOK_PUBLISH_ENABLED y credenciales.',
      );
    }
  }

  isEnabled(): boolean {
    return isTikTokPublishEnabled(this.config);
  }

  async startConnect(user: AuthUser, clientId: string): Promise<string> {
    this.assertEnabled();
    await this.assertClientBelongsToAgency(user.agencyId, clientId);
    await this.clientAccess.assertClientAccess(user, clientId);

    const state = randomBytes(32).toString('base64url');
    const redirectUri = this.getRedirectUri();

    await this.stateStore.save(state, {
      userId: user.id,
      agencyId: user.agencyId,
      clientId,
    });

    this.logger.log(`TikTok OAuth iniciado para cliente ${clientId}`);
    return this.tiktok.buildOAuthUrl(redirectUri, state);
  }

  async handleCallback(code: string, state: string) {
    this.assertEnabled();

    const pending = await this.stateStore.consume(state);
    if (!pending) {
      throw new TikTokOAuthStateInvalidError(this.getErrorRedirectUrl('tiktok_state'));
    }

    await this.assertClientBelongsToAgency(pending.agencyId, pending.clientId);

    const redirectUri = this.getRedirectUri();
    const tokens = await this.tiktok.exchangeCodeForToken(code, redirectUri);
    if (!tokens.open_id || !tokens.access_token) {
      throw new BadRequestException('TikTok no devolvió open_id o access_token');
    }

    const scopes = this.parseScopes(tokens.scope);
    const hasRequired = TIKTOK_REQUIRED_SCOPES.every((s) => scopes.includes(s));
    const connectionStatus = hasRequired ? null : 'permisos_incompletos';

    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const profile = await this.tiktok.getUserInfo(tokens.access_token);
      displayName = profile.display_name ?? null;
      avatarUrl = profile.avatar_url ?? null;
    } catch (error) {
      this.logger.warn(
        `TikTok perfil opcional falló: ${error instanceof Error ? error.message : 'error'}`,
      );
    }

    const encryptionKey = this.requireEncryptionKey();
    const account = await this.socialAccounts.upsert({
      agencyId: pending.agencyId,
      clientId: pending.clientId,
      platform: 'tiktok',
      externalAccountId: String(tokens.open_id),
      username: displayName,
      avatarUrl,
      connectionStatus,
      accessTokenEnc: encryptToken(tokens.access_token, encryptionKey),
      refreshTokenEnc: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, encryptionKey)
        : null,
      tokenExpiresAt: this.expiresAtFromSeconds(tokens.expires_in),
      refreshExpiresAt: this.expiresAtFromSeconds(tokens.refresh_expires_in),
      scopes: scopes.length > 0 ? scopes : [...TIKTOK_OAUTH_SCOPES],
    });

    this.logger.log(
      `TikTok conectado: open_id=${tokens.open_id} scopes=${scopes.join(',') || '(vacío)'}`,
    );

    return {
      agencyId: pending.agencyId,
      clientId: pending.clientId,
      accounts: [account],
    };
  }

  getSuccessRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?connected=tiktok`;
  }

  getErrorRedirectUrl(code: 'tiktok_state' | 'tiktok_denied'): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?error=${code}`;
  }

  private parseScopes(scope?: string): string[] {
    if (!scope?.trim()) return [];
    return scope
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async assertClientBelongsToAgency(agencyId: string, clientId: string) {
    const client = await this.clients.findById(agencyId, clientId);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('TIKTOK_REDIRECT_URI');
    if (!uri) throw new Error('TIKTOK_REDIRECT_URI no está definida');
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
