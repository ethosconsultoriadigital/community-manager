import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken, encryptToken } from '@cm/shared';
import { TikTokApiClient } from '../platforms/tiktok/tiktok-api.client';

@Injectable()
export class SocialAccountsService {
  constructor(
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly config: ConfigService,
    private readonly tiktok: TikTokApiClient,
  ) {}

  async disconnect(agencyId: string, id: string): Promise<void> {
    const account = await this.socialAccounts.findByIdWithToken(agencyId, id);
    if (!account) {
      throw new NotFoundException('Cuenta social no encontrada');
    }

    if (account.platform === 'tiktok' && account.is_active) {
      try {
        const token = decryptToken(
          account.access_token_enc,
          this.requireEncryptionKey(),
        );
        if (token && token !== 'revoked') {
          await this.tiktok.revokeToken(token);
        }
      } catch {
        // Seguimos desconectando localmente aunque revoke falle
      }
    }

    const cleared = encryptToken('revoked', this.requireEncryptionKey());
    const result = await this.socialAccounts.disconnect(agencyId, id, cleared);
    if (result.count === 0) {
      throw new NotFoundException('Cuenta social no encontrada');
    }
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
