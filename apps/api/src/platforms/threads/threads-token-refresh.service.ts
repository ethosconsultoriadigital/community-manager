import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken, encryptToken } from '@cm/shared';
import { isThreadsPublishEnabled } from '../platform-features';
import { ThreadsApiClient } from './threads-api.client';

const REFRESH_WINDOW_DAYS = 7;

@Injectable()
export class ThreadsTokenRefreshService {
  private readonly logger = new Logger(ThreadsTokenRefreshService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly threads: ThreadsApiClient,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    if (!isThreadsPublishEnabled(this.config)) {
      return { refreshed: 0, failed: 0 };
    }

    const until = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const accounts = await this.socialAccounts.findExpiringBefore(until);
    const threadsAccounts = accounts.filter((a) => a.platform === 'threads');
    const encryptionKey = this.requireEncryptionKey();

    let refreshed = 0;
    let failed = 0;

    for (const account of threadsAccounts) {
      try {
        const currentToken = decryptToken(account.access_token_enc, encryptionKey);
        const renewed = await this.threads.refreshLongLivedToken(currentToken);
        const encrypted = encryptToken(renewed.access_token, encryptionKey);
        const tokenExpiresAt = renewed.expires_in
          ? new Date(Date.now() + renewed.expires_in * 1000)
          : account.token_expires_at;

        await this.socialAccounts.updateTokens(account.agency_id, account.id, {
          accessTokenEnc: encrypted,
          tokenExpiresAt,
        });
        refreshed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`No se pudo refrescar cuenta Threads ${account.id}`);
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
