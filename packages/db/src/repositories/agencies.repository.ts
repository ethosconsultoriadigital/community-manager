import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaBytes = Prisma.agenciesUpdateInput['canva_access_token_enc'];

function toPrismaBytes(buffer: Buffer): PrismaBytes {
  return buffer as unknown as PrismaBytes;
}

const publicSelect = {
  id: true,
  name: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.agenciesSelect;

const canvaTokenSelect = {
  ...publicSelect,
  canva_access_token_enc: true,
  canva_refresh_token_enc: true,
  canva_token_expires_at: true,
} satisfies Prisma.agenciesSelect;

export type UpdateCanvaTokensData = {
  accessTokenEnc: Buffer;
  refreshTokenEnc?: Buffer | null;
  expiresAt?: Date | null;
};

export class AgenciesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(name: string) {
    return this.prisma.agencies.create({ data: { name } });
  }

  findAll() {
    return this.prisma.agencies.findMany({
      orderBy: { created_at: 'asc' },
      select: publicSelect,
    });
  }

  findById(id: string) {
    return this.prisma.agencies.findUnique({
      where: { id },
      select: publicSelect,
    });
  }

  findByIdWithCanvaTokens(id: string) {
    return this.prisma.agencies.findUnique({
      where: { id },
      select: canvaTokenSelect,
    });
  }

  update(id: string, name: string) {
    return this.prisma.agencies.update({
      where: { id },
      data: { name, updated_at: new Date() },
      select: publicSelect,
    });
  }

  updateCanvaTokens(id: string, data: UpdateCanvaTokensData) {
    return this.prisma.agencies.update({
      where: { id },
      data: {
        canva_access_token_enc: toPrismaBytes(data.accessTokenEnc),
        canva_refresh_token_enc:
          data.refreshTokenEnc === undefined
            ? undefined
            : data.refreshTokenEnc
              ? toPrismaBytes(data.refreshTokenEnc)
              : null,
        canva_token_expires_at: data.expiresAt ?? null,
        updated_at: new Date(),
      },
      select: canvaTokenSelect,
    });
  }

  delete(id: string) {
    return this.prisma.agencies.delete({ where: { id } });
  }
}
