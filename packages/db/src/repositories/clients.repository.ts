import type { PrismaClient } from '@prisma/client';
import {
  type ClientCreateData,
  type ClientUpdateData,
  TenantScope,
} from '../tenant/tenant-scope';

export class ClientsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private scope(agencyId: string) {
    return TenantScope.create(this.prisma, agencyId);
  }

  findAll(agencyId: string) {
    return this.scope(agencyId).findClients({ orderBy: { created_at: 'asc' } });
  }

  findById(agencyId: string, id: string) {
    return this.scope(agencyId).findClientById(id);
  }

  create(agencyId: string, data: ClientCreateData) {
    return this.scope(agencyId).createClient(data);
  }

  update(agencyId: string, id: string, data: ClientUpdateData) {
    return this.scope(agencyId).updateClient(id, data);
  }

  delete(agencyId: string, id: string) {
    return this.scope(agencyId).deleteClient(id);
  }
}
