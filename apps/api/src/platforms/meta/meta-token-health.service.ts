import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken } from '@cm/shared';
import { isMetaTokenOrPermissionError, REQUIERE_RECONEXION } from './meta-auth-error';
import { MetaGraphClient } from './meta-graph.client';

@Injectable()
export class MetaTokenHealthService {
  private readonly logger = new Logger(MetaTokenHealthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly meta: MetaGraphClient,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async validateActiveTokens(): Promise<{
    checked: number;
    marked: number;
    failed: number;
  }> {
    const accounts = await this.socialAccounts.findActiveMetaWithToken();
    const encryptionKey = this.requireEncryptionKey();
    let checked = 0;
    let marked = 0;
    let failed = 0;

    for (const account of accounts) {
      checked += 1;
      try {
        const accessToken = decryptToken(account.access_token_enc, encryptionKey);
        await this.meta.probeAccount(account.external_account_id, accessToken);
      } catch (error) {
        if (isMetaTokenOrPermissionError(error)) {
          await this.socialAccounts.updateConnectionStatus(
            account.agency_id,
            account.id,
            REQUIERE_RECONEXION,
          );
          marked += 1;
          this.logger.warn(
            `Cuenta Meta ${account.id} (${account.platform}) requiere reconexión`,
          );
        } else {
          failed += 1;
          this.logger.warn(
            `No se pudo revisar la cuenta Meta ${account.id} (${account.platform})`,
          );
        }
      }
    }

    return { checked, marked, failed };
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
