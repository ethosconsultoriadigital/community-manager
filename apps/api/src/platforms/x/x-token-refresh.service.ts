import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken, encryptToken } from '@cm/shared';
import { isXPublishEnabled } from '../platform-features';
import { XApiClient } from './x-api.client';

/** Access token de X ~2h; el job horario refresca los que vencen en ≤6h. */
const REFRESH_WINDOW_HOURS = 6;

@Injectable()
export class XTokenRefreshService {
  private readonly logger = new Logger(XTokenRefreshService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly x: XApiClient,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    if (!isXPublishEnabled(this.config)) {
      return { refreshed: 0, failed: 0 };
    }

    const until = new Date(Date.now() + REFRESH_WINDOW_HOURS * 60 * 60 * 1000);
    const accounts = await this.socialAccounts.findExpiringBefore(until);
    const xAccounts = accounts.filter((a) => a.platform === 'x' && a.refresh_token_enc);
    const encryptionKey = this.requireEncryptionKey();

    let refreshed = 0;
    let failed = 0;

    for (const account of xAccounts) {
      try {
        if (!account.refresh_token_enc) {
          failed += 1;
          continue;
        }
        const refreshToken = decryptToken(account.refresh_token_enc, encryptionKey);
        const renewed = await this.x.refreshAccessToken(refreshToken);
        const accessEnc = encryptToken(renewed.access_token, encryptionKey);
        const refreshEnc = renewed.refresh_token
          ? encryptToken(renewed.refresh_token, encryptionKey)
          : account.refresh_token_enc;
        const tokenExpiresAt = renewed.expires_in
          ? new Date(Date.now() + renewed.expires_in * 1000)
          : account.token_expires_at;

        await this.socialAccounts.updateTokens(account.agency_id, account.id, {
          accessTokenEnc: accessEnc,
          refreshTokenEnc: refreshEnc,
          tokenExpiresAt,
        });
        refreshed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`No se pudo refrescar cuenta X ${account.id}`);
        if (error instanceof Error) {
          this.logger.debug(error.message);
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
