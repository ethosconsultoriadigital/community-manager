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
import { randomBytes } from 'node:crypto';
import { ClientAccessService } from '../../access/client-access.service';
import { isThreadsPublishEnabled } from '../platform-features';
import { ThreadsApiClient } from './threads-api.client';
import { THREADS_OAUTH_SCOPES, type ThreadsOAuthState } from './threads.types';

@Injectable()
export class ThreadsOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly threads: ThreadsApiClient,
    private readonly clients: ClientsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  assertEnabled() {
    if (!isThreadsPublishEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'Threads no está habilitado. Configura THREADS_PUBLISH_ENABLED y credenciales.',
      );
    }
  }

  isEnabled(): boolean {
    return isThreadsPublishEnabled(this.config);
  }

  async startConnect(user: AuthUser, clientId: string): Promise<string> {
    this.assertEnabled();
    await this.assertClientBelongsToAgency(user.agencyId, clientId);
    await this.clientAccess.assertClientAccess(user, clientId);

    const redirectUri = this.getRedirectUri();
    const state = this.jwt.sign(
      {
        sub: user.id,
        agencyId: user.agencyId,
        clientId,
        nonce: randomBytes(16).toString('hex'),
      } satisfies ThreadsOAuthState,
      { expiresIn: '15m' },
    );

    return this.threads.buildOAuthUrl(redirectUri, [...THREADS_OAUTH_SCOPES], state);
  }

  async handleCallback(code: string, state: string) {
    this.assertEnabled();
    const payload = this.verifyState(state);
    await this.assertClientBelongsToAgency(payload.agencyId, payload.clientId);

    const redirectUri = this.getRedirectUri();
    // Meta a veces añade "#_" al code
    const cleanCode = code.replace(/#_$/, '');
    const shortLived = await this.threads.exchangeCodeForToken(cleanCode, redirectUri);
    const longLived = await this.threads.exchangeForLongLivedToken(shortLived.access_token);
    const profile = await this.threads.getMe(longLived.access_token);

    if (!profile.id) {
      throw new BadRequestException('No se pudo obtener el perfil de Threads');
    }

    const encryptionKey = this.requireEncryptionKey();
    const tokenExpiresAt = this.expiresAtFromSeconds(longLived.expires_in);
    const scopes = [...THREADS_OAUTH_SCOPES];

    const account = await this.socialAccounts.upsert({
      agencyId: payload.agencyId,
      clientId: payload.clientId,
      platform: 'threads',
      externalAccountId: String(profile.id),
      username: profile.username ?? null,
      accessTokenEnc: encryptToken(longLived.access_token, encryptionKey),
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
    return `${frontend}/cuentas?connected=threads`;
  }

  private verifyState(state: string): ThreadsOAuthState {
    try {
      return this.jwt.verify<ThreadsOAuthState>(state);
    } catch {
      throw new BadRequestException('State OAuth de Threads inválido o expirado');
    }
  }

  private async assertClientBelongsToAgency(agencyId: string, clientId: string) {
    const client = await this.clients.findById(agencyId, clientId);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('THREADS_REDIRECT_URI');
    if (!uri) throw new Error('THREADS_REDIRECT_URI no está definida');
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
