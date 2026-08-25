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
const ASSIGNABLE_ROLES = ['manager', 'viewer'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  client: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
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

    const clientByUserId = new Map(
      assignmentRows.map((row) => [row.user_id, row.clients]),
    );

    return users.map((user) => {
      const client = clientByUserId.get(user.id);
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        client: client
          ? { id: client.id, name: client.name, isActive: client.is_active }
          : null,
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
      clientId: string;
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
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException('Rol no permitido para usuarios de cliente');
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

    try {
      const assignment = await this.assignments.assign(agencyId, {
        userId: user.id,
        clientId: input.clientId,
      });
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        client: assignment.clients,
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
}
