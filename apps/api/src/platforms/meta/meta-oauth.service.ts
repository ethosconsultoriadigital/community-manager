import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientsRepository, SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';
import { ClientAccessService } from '../../access/client-access.service';
import { REQUIERE_RECONEXION } from './meta-auth-error';
import { MetaGraphClient } from './meta-graph.client';
import { META_OAUTH_SCOPES, type MetaOAuthState } from './meta.types';
import type { MetaPageAccount } from './meta.types';

export type MetaConnectResult = {
  agencyId: string;
  clientId: string;
  accounts: Awaited<ReturnType<SocialAccountsRepository['upsert']>>[];
  skipped: string[];
};

@Injectable()
export class MetaOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly meta: MetaGraphClient,
    private readonly clients: ClientsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  async startConnect(user: AuthUser, clientId: string): Promise<string> {
    await this.assertClientBelongsToAgency(user.agencyId, clientId);
    await this.clientAccess.assertClientAccess(user, clientId);

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

  async handleCallback(code: string, state: string): Promise<MetaConnectResult> {
    const payload = this.verifyState(state);
    await this.assertClientBelongsToAgency(payload.agencyId, payload.clientId);

    const redirectUri = this.getRedirectUri();
    const shortLived = await this.meta.exchangeCodeForToken(code, redirectUri);
    const longLived = await this.meta.exchangeForLongLivedToken(
      shortLived.access_token,
    );
    const pages = await this.meta.getUserPages(longLived.access_token);

    if (!pages.length) {
      throw new BadRequestException(
        'No se encontraron páginas de Facebook vinculadas a esta cuenta',
      );
    }

    const encryptionKey = this.requireEncryptionKey();
    const tokenExpiresAt = this.expiresAtFromSeconds(longLived.expires_in);
    const scopes = [...META_OAUTH_SCOPES];
    const saved: MetaConnectResult['accounts'] = [];
    const skipped: string[] = [];

    for (const page of pages) {
      const fbAccount = await this.saveIfAvailable({
        agencyId: payload.agencyId,
        clientId: payload.clientId,
        platform: 'facebook',
        externalAccountId: page.id,
        username: page.name,
        accessTokenEnc: encryptToken(page.access_token, encryptionKey),
        tokenExpiresAt,
        scopes,
      });
      if (fbAccount === 'skipped') {
        skipped.push(
          await this.skippedMessage('facebook', page.name || page.id, page.id),
        );
      } else {
        saved.push(fbAccount);
      }

      const ig = page.instagram_business_account;
      if (ig?.id) {
        const igAccount = await this.saveIfAvailable({
          agencyId: payload.agencyId,
          clientId: payload.clientId,
          platform: 'instagram',
          externalAccountId: ig.id,
          username: ig.username ?? null,
          accessTokenEnc: encryptToken(page.access_token, encryptionKey),
          tokenExpiresAt,
          scopes,
        });
        if (igAccount === 'skipped') {
          skipped.push(
            await this.skippedMessage(
              'instagram',
              ig.username ? `@${ig.username}` : ig.id,
              ig.id,
            ),
          );
        } else {
          saved.push(igAccount);
        }
      }
    }

    await this.markMissingAccounts(payload.agencyId, payload.clientId, pages);

    return {
      agencyId: payload.agencyId,
      clientId: payload.clientId,
      accounts: saved,
      skipped,
    };
  }

  getSuccessRedirectUrl(
    result?: Pick<MetaConnectResult, 'skipped' | 'accounts'>,
  ): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const params = new URLSearchParams({ connected: 'meta' });
    if (result?.skipped.length) {
      params.set('metaSkipped', result.skipped.join('\n'));
      if (!result.accounts.length) params.set('metaSaved', '0');
    }
    return `${frontend.replace(/\/$/, '')}/cuentas?${params}`;
  }

  private async saveIfAvailable(
    data: Parameters<SocialAccountsRepository['upsert']>[0],
  ): Promise<Awaited<ReturnType<SocialAccountsRepository['upsert']>> | 'skipped'> {
    const existing = await this.socialAccounts.findByPlatformExternalId(
      data.platform,
      data.externalAccountId,
    );
    if (existing && existing.client_id !== data.clientId) {
      return 'skipped';
    }
    return this.socialAccounts.upsert({
      ...data,
      connectionStatus: null,
    });
  }

  private async skippedMessage(
    platform: 'facebook' | 'instagram',
    label: string,
    externalId: string,
  ): Promise<string> {
    const existing = await this.socialAccounts.findByPlatformExternalId(
      platform,
      externalId,
    );
    let ownerName = 'otro cliente';
    if (existing) {
      const owner = await this.clients.findById(existing.agency_id, existing.client_id);
      if (owner?.name) ownerName = owner.name;
    }
    if (platform === 'instagram') {
      return `La cuenta de Instagram ${label} ya está conectada al cliente ${ownerName}; no se movió`;
    }
    return `La página ${label} ya está conectada al cliente ${ownerName}; no se movió`;
  }

  /** Cuentas FB/IG de este cliente que no vinieron en /me/accounts: requieren reconexión. */
  private async markMissingAccounts(
    agencyId: string,
    clientId: string,
    pages: MetaPageAccount[],
  ) {
    const arrived = new Set<string>();
    for (const page of pages) {
      arrived.add(`facebook:${page.id}`);
      if (page.instagram_business_account?.id) {
        arrived.add(`instagram:${page.instagram_business_account.id}`);
      }
    }

    const existing = await this.socialAccounts.findActiveByClientAndPlatforms(
      agencyId,
      clientId,
      ['facebook', 'instagram'],
    );
    await Promise.all(
      existing.map((account) => {
        const key = `${account.platform}:${account.external_account_id}`;
        if (arrived.has(key)) return Promise.resolve();
        return this.socialAccounts.updateConnectionStatus(
          agencyId,
          account.id,
          REQUIERE_RECONEXION,
        );
      }),
    );
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
