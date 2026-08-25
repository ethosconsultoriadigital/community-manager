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
        clients: {
          select: {
            id: true,
            name: true,
            is_active: true,
          },
        },
      },
    });
  }

  findByUserId(agencyId: string, userId: string) {
    return this.prisma.user_client_assignments.findFirst({
      where: scopedWhere(agencyId, { user_id: userId }),
      include: {
        clients: {
          select: { id: true, name: true, is_active: true },
        },
      },
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

    const existing = await this.prisma.user_client_assignments.findUnique({
      where: { user_id: data.userId },
    });
    if (existing) {
      throw new UserClientAssignmentsValidationError(
        'El usuario ya tiene un cliente asignado',
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
        clients: {
          select: { id: true, name: true, is_active: true },
        },
      },
    });
  }

  async removeByUserId(agencyId: string, userId: string) {
    const result = await this.prisma.user_client_assignments.deleteMany({
      where: scopedWhere(agencyId, { user_id: userId }),
    });
    return result.count > 0;
  }
}
