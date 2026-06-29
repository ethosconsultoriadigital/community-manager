import type { Prisma, PrismaClient, social_platform } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

type PrismaBytes = Prisma.social_accountsCreateInput['access_token_enc'];

function toPrismaBytes(buffer: Buffer): PrismaBytes {
  return buffer as unknown as PrismaBytes;
}

export type UpsertSocialAccountData = {
  agencyId: string;
  clientId: string;
  platform: social_platform;
  externalAccountId: string;
  username?: string | null;
  accessTokenEnc: Buffer;
  refreshTokenEnc?: Buffer | null;
  tokenExpiresAt?: Date | null;
  scopes: string[];
};

const publicSelect = {
  id: true,
  agency_id: true,
  client_id: true,
  platform: true,
  external_account_id: true,
  username: true,
  token_expires_at: true,
  scopes: true,
  is_active: true,
  connected_at: true,
  updated_at: true,
} satisfies Prisma.social_accountsSelect;

export class SocialAccountsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByAgency(agencyId: string, clientId?: string) {
    return this.prisma.social_accounts.findMany({
      where: scopedWhere(agencyId, clientId ? { client_id: clientId } : undefined),
      orderBy: { connected_at: 'desc' },
      select: publicSelect,
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.social_accounts.findFirst({
      where: scopedWhere(agencyId, { id }),
      select: publicSelect,
    });
  }

  findByIdWithToken(agencyId: string, id: string) {
    return this.prisma.social_accounts.findFirst({
      where: scopedWhere(agencyId, { id }),
    });
  }

  /** Cuentas con token próximo a vencer (para refresco proactivo). */
  findExpiringBefore(until: Date) {
    return this.prisma.social_accounts.findMany({
      where: {
        is_active: true,
        token_expires_at: { lte: until },
      },
      orderBy: { token_expires_at: 'asc' },
    });
  }

  upsert(data: UpsertSocialAccountData) {
    return this.prisma.social_accounts.upsert({
      where: {
        platform_external_account_id: {
          platform: data.platform,
          external_account_id: data.externalAccountId,
        },
      },
      create: {
        agency_id: data.agencyId,
        client_id: data.clientId,
        platform: data.platform,
        external_account_id: data.externalAccountId,
        username: data.username,
        access_token_enc: toPrismaBytes(data.accessTokenEnc),
        refresh_token_enc: data.refreshTokenEnc
          ? toPrismaBytes(data.refreshTokenEnc)
          : null,
        token_expires_at: data.tokenExpiresAt,
        scopes: data.scopes,
      },
      update: {
        agency_id: data.agencyId,
        client_id: data.clientId,
        username: data.username,
        access_token_enc: toPrismaBytes(data.accessTokenEnc),
        refresh_token_enc: data.refreshTokenEnc
          ? toPrismaBytes(data.refreshTokenEnc)
          : null,
        token_expires_at: data.tokenExpiresAt,
        scopes: data.scopes,
        is_active: true,
        updated_at: new Date(),
      },
      select: publicSelect,
    });
  }

  updateTokens(
    agencyId: string,
    id: string,
    tokens: {
      accessTokenEnc: Buffer;
      refreshTokenEnc?: Buffer | null;
      tokenExpiresAt?: Date | null;
    },
  ) {
    return this.prisma.social_accounts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: {
        access_token_enc: toPrismaBytes(tokens.accessTokenEnc),
        refresh_token_enc: tokens.refreshTokenEnc
          ? toPrismaBytes(tokens.refreshTokenEnc)
          : tokens.refreshTokenEnc,
        token_expires_at: tokens.tokenExpiresAt,
        updated_at: new Date(),
      },
    });
  }

  /** Marca la cuenta inactiva y sustituye tokens por un valor cifrado de revocación. */
  disconnect(agencyId: string, id: string, clearedTokenEnc: Buffer) {
    return this.prisma.social_accounts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: {
        is_active: false,
        access_token_enc: toPrismaBytes(clearedTokenEnc),
        refresh_token_enc: null,
        token_expires_at: null,
        scopes: [],
        updated_at: new Date(),
      },
    });
  }
}
