import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken, encryptToken } from '@cm/shared';
import { isTikTokPublishEnabled } from '../platform-features';
import { TikTokApiClient } from './tiktok-api.client';

/** Access token ~24h; renovar si expira en ≤2h. */
const REFRESH_WINDOW_HOURS = 2;

@Injectable()
export class TikTokTokenRefreshService {
  private readonly logger = new Logger(TikTokTokenRefreshService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tiktok: TikTokApiClient,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    if (!isTikTokPublishEnabled(this.config)) {
      return { refreshed: 0, failed: 0 };
    }

    const until = new Date(Date.now() + REFRESH_WINDOW_HOURS * 60 * 60 * 1000);
    const accounts = await this.socialAccounts.findExpiringBefore(until);
    const tiktokAccounts = accounts.filter(
      (a) =>
        a.platform === 'tiktok' &&
        a.refresh_token_enc &&
        a.connection_status !== 'requiere_reconexion',
    );
    const encryptionKey = this.requireEncryptionKey();

    let refreshed = 0;
    let failed = 0;

    for (const account of tiktokAccounts) {
      try {
        if (!account.refresh_token_enc) {
          failed += 1;
          continue;
        }
        const refreshToken = decryptToken(account.refresh_token_enc, encryptionKey);
        const renewed = await this.tiktok.refreshAccessToken(refreshToken);
        if (!renewed.access_token) {
          throw new Error('TikTok refresh sin access_token');
        }

        await this.socialAccounts.updateTokens(account.agency_id, account.id, {
          accessTokenEnc: encryptToken(renewed.access_token, encryptionKey),
          refreshTokenEnc: renewed.refresh_token
            ? encryptToken(renewed.refresh_token, encryptionKey)
            : Buffer.from(account.refresh_token_enc),
          tokenExpiresAt: renewed.expires_in
            ? new Date(Date.now() + renewed.expires_in * 1000)
            : account.token_expires_at,
          refreshExpiresAt: renewed.refresh_expires_in
            ? new Date(Date.now() + renewed.refresh_expires_in * 1000)
            : undefined,
          connectionStatus: null,
        });
        refreshed += 1;
      } catch (error) {
        failed += 1;
        const msg = error instanceof Error ? error.message : 'error';
        this.logger.warn(`No se pudo refrescar cuenta TikTok ${account.id}: ${msg}`);
        const invalid =
          /invalid|expired|revoke/i.test(msg) || /token/i.test(msg);
        if (invalid) {
          await this.socialAccounts.updateConnectionStatus(
            account.agency_id,
            account.id,
            'requiere_reconexion',
          );
        }
      }
    }

    return { refreshed, failed };
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
