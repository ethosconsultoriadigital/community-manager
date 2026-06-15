import type { Prisma, PrismaClient } from '@prisma/client';

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export function requireAgencyId(agencyId: string | undefined | null): string {
  if (!agencyId?.trim()) {
    throw new TenantScopeError('agency_id es obligatorio');
  }
  return agencyId;
}

/** Añade agency_id a un filtro Prisma; impide consultas sin tenant. */
export function scopedWhere<T extends Record<string, unknown>>(
  agencyId: string,
  where?: T,
): T & { agency_id: string } {
  return { ...(where ?? ({} as T)), agency_id: requireAgencyId(agencyId) };
}

export type ClientCreateData = {
  name: string;
  brand?: Record<string, unknown>;
  is_active?: boolean;
};

export type ClientUpdateData = {
  name?: string;
  brand?: Record<string, unknown>;
  is_active?: boolean;
};

/**
 * Operaciones sobre modelos con agency_id, siempre filtradas por tenant.
 * Instanciar con TenantScope.create(prisma, agencyId).
 */
export class TenantScope {
  readonly agencyId: string;

  private constructor(
    private readonly prisma: PrismaClient,
    agencyId: string,
  ) {
    this.agencyId = requireAgencyId(agencyId);
  }

  static create(prisma: PrismaClient, agencyId: string | undefined | null): TenantScope {
    return new TenantScope(prisma, requireAgencyId(agencyId));
  }

  async findClients(args?: Omit<Prisma.clientsFindManyArgs, 'where'> & { where?: Prisma.clientsWhereInput }) {
    const { where, ...rest } = args ?? {};
    return this.prisma.clients.findMany({
      ...rest,
      where: scopedWhere(this.agencyId, where),
    });
  }

  async findClientById(id: string) {
    return this.prisma.clients.findFirst({
      where: scopedWhere(this.agencyId, { id }),
    });
  }

  async createClient(data: ClientCreateData) {
    return this.prisma.clients.create({
      data: {
        name: data.name,
        brand: (data.brand ?? {}) as Prisma.InputJsonValue,
        is_active: data.is_active ?? true,
        agencies: { connect: { id: this.agencyId } },
      },
    });
  }

  async updateClient(id: string, data: ClientUpdateData) {
    const updateData: Prisma.clientsUpdateManyMutationInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.brand !== undefined) {
      updateData.brand = data.brand as Prisma.InputJsonValue;
    }

    const result = await this.prisma.clients.updateMany({
      where: scopedWhere(this.agencyId, { id }),
      data: updateData,
    });
    if (result.count === 0) return null;
    return this.findClientById(id);
  }

  async deleteClient(id: string) {
    const result = await this.prisma.clients.deleteMany({
      where: scopedWhere(this.agencyId, { id }),
    });
    return result.count > 0;
  }
}
