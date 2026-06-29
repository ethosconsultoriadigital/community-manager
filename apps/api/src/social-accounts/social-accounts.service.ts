import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { encryptToken } from '@cm/shared';

@Injectable()
export class SocialAccountsService {
  constructor(
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly config: ConfigService,
  ) {}

  async disconnect(agencyId: string, id: string): Promise<void> {
    const account = await this.socialAccounts.findById(agencyId, id);
    if (!account) {
      throw new NotFoundException('Cuenta social no encontrada');
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
