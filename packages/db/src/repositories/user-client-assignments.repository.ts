import type { PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class UserClientAssignmentsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserClientAssignmentsValidationError';
  }
}

export type AssignUserClientData = {
  userId: string;
  clientId: string;
};

const clientSelect = { id: true, name: true, is_active: true } as const;

export class UserClientAssignmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByAgency(agencyId: string) {
    return this.prisma.user_client_assignments.findMany({
      where: scopedWhere(agencyId),
      orderBy: { created_at: 'asc' },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            full_name: true,
            role: true,
            is_active: true,
            created_at: true,
          },
        },
        clients: { select: clientSelect },
      },
    });
  }

  /** Todas las asignaciones de un usuario (0..N clientes). */
  findAllByUserId(agencyId: string, userId: string) {
    return this.prisma.user_client_assignments.findMany({
      where: scopedWhere(agencyId, { user_id: userId }),
      orderBy: { created_at: 'asc' },
      include: {
        clients: { select: clientSelect },
      },
    });
  }

  /** Primera asignación (compatibilidad). Preferir findAllByUserId. */
  findByUserId(agencyId: string, userId: string) {
    return this.prisma.user_client_assignments.findFirst({
      where: scopedWhere(agencyId, { user_id: userId }),
      include: {
        clients: { select: clientSelect },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  countByClientId(agencyId: string, clientId: string) {
    return this.prisma.user_client_assignments.count({
      where: scopedWhere(agencyId, { client_id: clientId }),
    });
  }

  async assign(agencyId: string, data: AssignUserClientData) {
    const user = await this.prisma.users.findFirst({
      where: scopedWhere(agencyId, { id: data.userId }),
    });
    if (!user) {
      throw new UserClientAssignmentsValidationError('Usuario no encontrado en la agencia');
    }

    const client = await this.prisma.clients.findFirst({
      where: scopedWhere(agencyId, { id: data.clientId }),
    });
    if (!client) {
      throw new UserClientAssignmentsValidationError('Cliente no encontrado en la agencia');
    }

    const existing = await this.prisma.user_client_assignments.findFirst({
      where: scopedWhere(agencyId, {
        user_id: data.userId,
        client_id: data.clientId,
      }),
    });
    if (existing) {
      throw new UserClientAssignmentsValidationError(
        'El usuario ya tiene asignado ese cliente',
      );
    }

    return this.prisma.user_client_assignments.create({
      data: {
        agency_id: agencyId,
        user_id: data.userId,
        client_id: data.clientId,
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            full_name: true,
            role: true,
            is_active: true,
            created_at: true,
          },
        },
        clients: { select: clientSelect },
      },
    });
  }

  /**
   * Reemplaza el conjunto de clientes del usuario.
   * clientIds vacío elimina todas las asignaciones.
   */
  async setClients(agencyId: string, userId: string, clientIds: string[]) {
    const user = await this.prisma.users.findFirst({
      where: scopedWhere(agencyId, { id: userId }),
    });
    if (!user) {
      throw new UserClientAssignmentsValidationError('Usuario no encontrado en la agencia');
    }

    const uniqueIds = [...new Set(clientIds.map((id) => id.trim()).filter(Boolean))];

    if (uniqueIds.length > 0) {
      const clients = await this.prisma.clients.findMany({
        where: scopedWhere(agencyId, { id: { in: uniqueIds } }),
        select: { id: true },
      });
      if (clients.length !== uniqueIds.length) {
        throw new UserClientAssignmentsValidationError(
          'Uno o más clientes no pertenecen a la agencia',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user_client_assignments.deleteMany({
        where: { agency_id: agencyId, user_id: userId },
      });
      if (uniqueIds.length === 0) return;
      await tx.user_client_assignments.createMany({
        data: uniqueIds.map((clientId) => ({
          agency_id: agencyId,
          user_id: userId,
          client_id: clientId,
        })),
      });
    });

    return this.findAllByUserId(agencyId, userId);
  }

  /** Compat: deja un solo cliente (reemplaza el conjunto). */
  async reassign(agencyId: string, userId: string, clientId: string) {
    return this.setClients(agencyId, userId, [clientId]);
  }

  async removeByUserId(agencyId: string, userId: string) {
    const result = await this.prisma.user_client_assignments.deleteMany({
      where: scopedWhere(agencyId, { user_id: userId }),
    });
    return result.count > 0;
  }
}
