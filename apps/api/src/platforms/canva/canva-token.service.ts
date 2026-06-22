import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgenciesRepository } from '@cm/db';
import { decryptToken, encryptToken } from '@cm/shared';
import { CanvaConnectClient } from './canva-connect.client';

@Injectable()
export class CanvaTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly agencies: AgenciesRepository,
    private readonly canva: CanvaConnectClient,
  ) {}

  isIntegrationConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CANVA_CLIENT_ID') &&
        this.config.get<string>('CANVA_CLIENT_SECRET'),
    );
  }

  async hasCanvaAccess(agencyId: string): Promise<boolean> {
    if (this.config.get<string>('CANVA_ACCESS_TOKEN')) return true;
    const agency = await this.agencies.findByIdWithCanvaTokens(agencyId);
    return Boolean(agency?.canva_access_token_enc);
  }

  async getAccessToken(agencyId: string): Promise<string | null> {
    const envToken = this.config.get<string>('CANVA_ACCESS_TOKEN');
    if (envToken) return envToken;

    const agency = await this.agencies.findByIdWithCanvaTokens(agencyId);
    if (!agency?.canva_access_token_enc) return null;

    const encryptionKey = this.requireEncryptionKey();
    const accessToken = decryptToken(agency.canva_access_token_enc, encryptionKey);

    const expiresAt = agency.canva_token_expires_at;
    const stillValid =
      expiresAt instanceof Date && expiresAt.getTime() > Date.now() + 60_000;

    if (stillValid) return accessToken;

    if (!agency.canva_refresh_token_enc) return accessToken;

    const refreshToken = decryptToken(agency.canva_refresh_token_enc, encryptionKey);
    const renewed = await this.canva.refreshAccessToken(refreshToken);

    await this.agencies.updateCanvaTokens(agencyId, {
      accessTokenEnc: encryptToken(renewed.access_token, encryptionKey),
      refreshTokenEnc: renewed.refresh_token
        ? encryptToken(renewed.refresh_token, encryptionKey)
        : agency.canva_refresh_token_enc
          ? Buffer.from(agency.canva_refresh_token_enc)
          : null,
      expiresAt: this.expiresAtFromSeconds(renewed.expires_in),
    });

    return renewed.access_token;
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
