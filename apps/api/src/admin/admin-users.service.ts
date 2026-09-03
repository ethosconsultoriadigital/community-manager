import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  UserClientAssignmentsRepository,
  UserClientAssignmentsValidationError,
  UsersRepository,
} from '@cm/db';
import type { AuthUser, UserRole } from '@cm/shared';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const ASSIGNABLE_ROLES = ['owner', 'manager', 'viewer'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

function isClientScopedRole(role: UserRole | AssignableRole): boolean {
  return role === 'manager' || role === 'viewer';
}

export type AdminUserClient = {
  id: string;
  name: string;
  isActive: boolean;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  /** @deprecated usar clients — primer cliente o null */
  client: AdminUserClient | null;
  clients: AdminUserClient[];
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly assignments: UserClientAssignmentsRepository,
  ) {}

  async listUsers(agencyId: string): Promise<AdminUserListItem[]> {
    const [users, assignmentRows] = await Promise.all([
      this.users.findByAgency(agencyId),
      this.assignments.findByAgency(agencyId),
    ]);

    const clientsByUserId = new Map<string, AdminUserClient[]>();
    for (const row of assignmentRows) {
      const list = clientsByUserId.get(row.user_id) ?? [];
      list.push({
        id: row.clients.id,
        name: row.clients.name,
        isActive: row.clients.is_active,
      });
      clientsByUserId.set(row.user_id, list);
    }

    return users.map((user) => {
      const clients = clientsByUserId.get(user.id) ?? [];
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        client: clients[0] ?? null,
        clients,
      };
    });
  }

  async createUser(
    agencyId: string,
    actor: AuthUser,
    input: {
      email: string;
      password: string;
      fullName?: string;
      role?: AssignableRole;
      clientId?: string;
      clientIds?: string[];
    },
  ) {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password?.trim()) {
      throw new BadRequestException('Email y contraseña son obligatorios');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const role = input.role ?? 'manager';
    if (!isAssignableRole(role)) {
      throw new BadRequestException('Rol no permitido');
    }

    const clientIds = this.resolveClientIds(input);
    if (isClientScopedRole(role) && clientIds.length === 0) {
      throw new BadRequestException(
        'Los roles manager y viewer requieren al menos un cliente asignado',
      );
    }

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      agencyId,
      email,
      passwordHash,
      fullName: input.fullName?.trim() || undefined,
      role,
    });

    if (role === 'owner') {
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        client: null,
        clients: [],
        createdBy: actor.id,
      };
    }

    try {
      const rows = await this.assignments.setClients(agencyId, user.id, clientIds);
      const clients = rows.map((row) => ({
        id: row.clients.id,
        name: row.clients.name,
        isActive: row.clients.is_active,
      }));
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        client: clients[0] ?? null,
        clients,
        createdBy: actor.id,
      };
    } catch (error) {
      await this.users.deleteInAgency(agencyId, user.id);
      if (error instanceof UserClientAssignmentsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async setUserActive(agencyId: string, userId: string, isActive: boolean) {
    const user = await this.users.findByIdInAgency(agencyId, userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'owner') {
      throw new ForbiddenException('No se puede desactivar al propietario de la agencia');
    }

    const updated = await this.users.setActive(agencyId, userId, isActive);
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return { id: userId, isActive };
  }

  async resetPassword(agencyId: string, userId: string, newPassword: string) {
    if (!newPassword?.trim() || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const user = await this.users.findByIdInAgency(agencyId, userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'owner') {
      throw new ForbiddenException('No se puede resetear la contraseña del propietario desde aquí');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.users.updatePasswordHash(agencyId, userId, passwordHash);
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return { id: userId, passwordReset: true };
  }

  async updateUser(
    agencyId: string,
    userId: string,
    input: {
      fullName?: string;
      role?: AssignableRole;
      clientId?: string;
      clientIds?: string[];
    },
  ): Promise<AdminUserListItem> {
    const user = await this.users.findByIdInAgency(agencyId, userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'owner') {
      throw new ForbiddenException('No se puede editar al propietario de la agencia');
    }

    if (input.role !== undefined && !isAssignableRole(input.role)) {
      throw new BadRequestException('Rol no permitido');
    }

    const nextRole = input.role ?? user.role;
    const hasClientPayload =
      input.clientIds !== undefined || input.clientId !== undefined;
    const clientIds = hasClientPayload ? this.resolveClientIds(input) : null;

    if (isClientScopedRole(nextRole)) {
      if (clientIds !== null && clientIds.length === 0) {
        throw new BadRequestException(
          'Los roles manager y viewer requieren al menos un cliente asignado',
        );
      }
      if (clientIds === null) {
        const current = await this.listUsers(agencyId);
        const item = current.find((row) => row.id === userId);
        if (!item?.clients.length) {
          throw new BadRequestException(
            'Los roles manager y viewer requieren al menos un cliente asignado',
          );
        }
      }
    }

    const profileUpdate: { fullName?: string; role?: AssignableRole } = {};
    if (input.fullName !== undefined) {
      profileUpdate.fullName = input.fullName.trim();
    }
    if (input.role !== undefined) {
      profileUpdate.role = input.role;
    }

    if (Object.keys(profileUpdate).length > 0) {
      const updated = await this.users.updateProfile(agencyId, userId, profileUpdate);
      if (!updated) throw new NotFoundException('Usuario no encontrado');
    }

    if (nextRole === 'owner') {
      await this.assignments.removeByUserId(agencyId, userId);
    } else if (isClientScopedRole(nextRole) && clientIds !== null) {
      try {
        await this.assignments.setClients(agencyId, userId, clientIds);
      } catch (error) {
        if (error instanceof UserClientAssignmentsValidationError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }

    const items = await this.listUsers(agencyId);
    const item = items.find((row) => row.id === userId);
    if (!item) throw new NotFoundException('Usuario no encontrado');
    return item;
  }

  async deleteUser(agencyId: string, actorId: string, userId: string) {
    if (actorId === userId) {
      throw new ForbiddenException('No puedes eliminar tu propio usuario');
    }

    const user = await this.users.findByIdInAgency(agencyId, userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'owner') {
      throw new ForbiddenException('No se puede eliminar al propietario de la agencia');
    }

    await this.assignments.removeByUserId(agencyId, userId);
    const deleted = await this.users.deleteInAgency(agencyId, userId);
    if (!deleted) throw new NotFoundException('Usuario no encontrado');
    return { id: userId, deleted: true };
  }

  private resolveClientIds(input: {
    clientId?: string;
    clientIds?: string[];
  }): string[] {
    if (input.clientIds !== undefined) {
      return [...new Set(input.clientIds.map((id) => id.trim()).filter(Boolean))];
    }
    if (input.clientId?.trim()) {
      return [input.clientId.trim()];
    }
    return [];
  }
}
