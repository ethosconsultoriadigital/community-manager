import type { Prisma, PrismaClient, source_type } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class ContentSourcesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentSourcesValidationError';
  }
}

export type CreateContentSourceData = {
  clientId: string;
  type: source_type;
  name: string;
  config?: Record<string, unknown>;
  minScore?: number;
};

export class ContentSourcesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(agencyId: string, clientId?: string) {
    return this.prisma.content_sources.findMany({
      where: scopedWhere(agencyId, clientId ? { client_id: clientId } : undefined),
      orderBy: { created_at: 'desc' },
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.content_sources.findFirst({
      where: scopedWhere(agencyId, { id }),
    });
  }

  async create(agencyId: string, data: CreateContentSourceData) {
    const client = await this.prisma.clients.findFirst({
      where: scopedWhere(agencyId, { id: data.clientId }),
    });
    if (!client) {
      throw new ContentSourcesValidationError('Cliente no encontrado');
    }

    return this.prisma.content_sources.create({
      data: {
        type: data.type,
        name: data.name,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        min_score: data.minScore,
        is_active: true,
        agencies: { connect: { id: agencyId } },
        clients: { connect: { id: data.clientId } },
      },
    });
  }
}
