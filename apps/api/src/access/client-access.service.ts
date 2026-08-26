import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserClientAssignmentsRepository } from '@cm/db';
import type { AuthUser, UserRole } from '@cm/shared';

const AGENCY_WIDE_ROLES: UserRole[] = ['owner', 'admin'];

export type ClientListScope =
  | { mode: 'all' }
  | { mode: 'single'; clientId: string }
  | { mode: 'none' };

@Injectable()
export class ClientAccessService {
  constructor(private readonly assignments: UserClientAssignmentsRepository) {}

  hasAgencyWideAccess(role: UserRole): boolean {
    return AGENCY_WIDE_ROLES.includes(role);
  }

  async getAssignedClientId(user: AuthUser): Promise<string | null> {
    if (this.hasAgencyWideAccess(user.role)) {
      return null;
    }

    const assignment = await this.assignments.findByUserId(user.agencyId, user.id);
    return assignment?.client_id ?? null;
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

    const assignedClientId = await this.getAssignedClientId(user);
    if (!assignedClientId) {
      return { mode: 'none' };
    }

    if (requestedClientId?.trim() && requestedClientId.trim() !== assignedClientId) {
      throw new ForbiddenException('No tienes acceso a ese cliente');
    }

    return { mode: 'single', clientId: assignedClientId };
  }

  async assertClientAccess(user: AuthUser, clientId: string): Promise<void> {
    if (this.hasAgencyWideAccess(user.role)) {
      return;
    }

    const assignedClientId = await this.getAssignedClientId(user);
    if (!assignedClientId || assignedClientId !== clientId) {
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
