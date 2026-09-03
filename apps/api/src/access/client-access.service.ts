import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserClientAssignmentsRepository } from '@cm/db';
import type { AuthUser, UserRole } from '@cm/shared';

const AGENCY_WIDE_ROLES: UserRole[] = ['owner', 'admin'];

export type ClientListScope =
  | { mode: 'all' }
  | { mode: 'single'; clientId: string }
  | { mode: 'multi'; clientIds: string[] }
  | { mode: 'none' };

@Injectable()
export class ClientAccessService {
  constructor(private readonly assignments: UserClientAssignmentsRepository) {}

  hasAgencyWideAccess(role: UserRole): boolean {
    return AGENCY_WIDE_ROLES.includes(role);
  }

  async getAssignedClientIds(user: AuthUser): Promise<string[]> {
    if (this.hasAgencyWideAccess(user.role)) {
      return [];
    }

    const rows = await this.assignments.findAllByUserId(user.agencyId, user.id);
    return rows.map((row) => row.client_id);
  }

  /** Compat: primer cliente asignado o null. */
  async getAssignedClientId(user: AuthUser): Promise<string | null> {
    const ids = await this.getAssignedClientIds(user);
    return ids[0] ?? null;
  }

  async resolveListScope(
    user: AuthUser,
    requestedClientId?: string,
  ): Promise<ClientListScope> {
    if (this.hasAgencyWideAccess(user.role)) {
      if (requestedClientId?.trim()) {
        return { mode: 'single', clientId: requestedClientId.trim() };
      }
      return { mode: 'all' };
    }

    const assignedIds = await this.getAssignedClientIds(user);
    if (assignedIds.length === 0) {
      return { mode: 'none' };
    }

    if (requestedClientId?.trim()) {
      const requested = requestedClientId.trim();
      if (!assignedIds.includes(requested)) {
        throw new ForbiddenException('No tienes acceso a ese cliente');
      }
      return { mode: 'single', clientId: requested };
    }

    if (assignedIds.length === 1) {
      return { mode: 'single', clientId: assignedIds[0] };
    }

    return { mode: 'multi', clientIds: assignedIds };
  }

  async assertClientAccess(user: AuthUser, clientId: string): Promise<void> {
    if (this.hasAgencyWideAccess(user.role)) {
      return;
    }

    const assignedIds = await this.getAssignedClientIds(user);
    if (!assignedIds.includes(clientId)) {
      throw new ForbiddenException('No tienes acceso a este cliente');
    }
  }

  async assertPostAccess(
    user: AuthUser,
    post: { client_id: string } | null | undefined,
  ): Promise<void> {
    if (!post) return;
    await this.assertClientAccess(user, post.client_id);
  }
}
