import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientsRepository, SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';
import { MetaGraphClient } from './meta-graph.client';
import { META_OAUTH_SCOPES, type MetaOAuthState } from './meta.types';

@Injectable()
export class MetaOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly meta: MetaGraphClient,
    private readonly clients: ClientsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async startConnect(user: AuthUser, clientId: string): Promise<string> {
    await this.assertClientBelongsToAgency(user.agencyId, clientId);

    const redirectUri = this.getRedirectUri();
    const state = this.jwt.sign(
      {
        sub: user.id,
        agencyId: user.agencyId,
        clientId,
        nonce: randomBytes(16).toString('hex'),
      } satisfies MetaOAuthState,
      { expiresIn: '15m' },
    );

    return this.meta.buildOAuthUrl(redirectUri, [...META_OAUTH_SCOPES], state);
  }

  async handleCallback(code: string, state: string) {
    const payload = this.verifyState(state);
    await this.assertClientBelongsToAgency(payload.agencyId, payload.clientId);

    const redirectUri = this.getRedirectUri();
    const shortLived = await this.meta.exchangeCodeForToken(code, redirectUri);
    const longLived = await this.meta.exchangeForLongLivedToken(shortLived.access_token);
    const pages = await this.meta.getUserPages(longLived.access_token);

    if (!pages.length) {
      throw new BadRequestException(
        'No se encontraron páginas de Facebook vinculadas a esta cuenta',
      );
    }

    const encryptionKey = this.requireEncryptionKey();
    const tokenExpiresAt = this.expiresAtFromSeconds(longLived.expires_in);
    const scopes = [...META_OAUTH_SCOPES];
    const saved = [];

    for (const page of pages) {
      const fbAccount = await this.socialAccounts.upsert({
        agencyId: payload.agencyId,
        clientId: payload.clientId,
        platform: 'facebook',
        externalAccountId: page.id,
        username: page.name,
        accessTokenEnc: encryptToken(page.access_token, encryptionKey),
        tokenExpiresAt,
        scopes,
      });
      saved.push(fbAccount);

      const ig = page.instagram_business_account;
      if (ig?.id) {
        const igAccount = await this.socialAccounts.upsert({
          agencyId: payload.agencyId,
          clientId: payload.clientId,
          platform: 'instagram',
          externalAccountId: ig.id,
          username: ig.username ?? null,
          accessTokenEnc: encryptToken(page.access_token, encryptionKey),
          tokenExpiresAt,
          scopes,
        });
        saved.push(igAccount);
      }
    }

    return {
      agencyId: payload.agencyId,
      clientId: payload.clientId,
      accounts: saved,
    };
  }

  getSuccessRedirectUrl(): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/cuentas?connected=meta`;
  }

  private verifyState(state: string): MetaOAuthState {
    try {
      return this.jwt.verify<MetaOAuthState>(state);
    } catch {
      throw new BadRequestException('State OAuth inválido o expirado');
    }
  }

  private async assertClientBelongsToAgency(agencyId: string, clientId: string) {
    const client = await this.clients.findById(agencyId, clientId);
    if (!client) throw new NotFoundException('Cliente no encontrado');
  }

  private getRedirectUri(): string {
    const uri = this.config.get<string>('META_REDIRECT_URI');
    if (!uri) throw new Error('META_REDIRECT_URI no está definida');
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
