import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from '../repositories/agencies.repository';
import { ClientsRepository } from '../repositories/clients.repository';
import { requireAgencyId, TenantScopeError } from './tenant-scope';

const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);

const suffix = Date.now();

describe('requireAgencyId', () => {
  it('rechaza agency_id vacío o ausente', () => {
    expect(() => requireAgencyId(undefined)).toThrow(TenantScopeError);
    expect(() => requireAgencyId('')).toThrow(TenantScopeError);
    expect(() => requireAgencyId('   ')).toThrow(TenantScopeError);
  });

  it('acepta un agency_id válido', () => {
    expect(requireAgencyId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });
});

describe('aislamiento multi-tenant — clients', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    const agencyA = await agenciesRepo.create(`Agencia A ${suffix}`);
    const agencyB = await agenciesRepo.create(`Agencia B ${suffix}`);
    agencyAId = agencyA.id;
    agencyBId = agencyB.id;

    const clientA = await clientsRepo.create(agencyAId, { name: `Cliente A ${suffix}` });
    const clientB = await clientsRepo.create(agencyBId, { name: `Cliente B ${suffix}` });
    clientAId = clientA.id;
    clientBId = clientB.id;
  });

  afterAll(async () => {
    await prisma.clients.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('cada agencia solo ve sus propios clientes', async () => {
    const clientsA = await clientsRepo.findAll(agencyAId);
    const clientsB = await clientsRepo.findAll(agencyBId);

    expect(clientsA.map((c) => c.id)).toContain(clientAId);
    expect(clientsA.map((c) => c.id)).not.toContain(clientBId);
    expect(clientsB.map((c) => c.id)).toContain(clientBId);
    expect(clientsB.map((c) => c.id)).not.toContain(clientAId);
  });

  it('no puede leer un cliente de otra agencia por id', async () => {
    const crossRead = await clientsRepo.findById(agencyAId, clientBId);
    expect(crossRead).toBeNull();
  });

  it('no puede actualizar un cliente de otra agencia', async () => {
    const updated = await clientsRepo.update(agencyAId, clientBId, {
      name: 'Hackeado',
    });
    expect(updated).toBeNull();

    const clientB = await clientsRepo.findById(agencyBId, clientBId);
    expect(clientB?.name).toBe(`Cliente B ${suffix}`);
  });

  it('no puede eliminar un cliente de otra agencia', async () => {
    const deleted = await clientsRepo.delete(agencyAId, clientBId);
    expect(deleted).toBe(false);

    const clientB = await clientsRepo.findById(agencyBId, clientBId);
    expect(clientB).not.toBeNull();
  });

  it('puede CRUD dentro de su propia agencia', async () => {
    const created = await clientsRepo.create(agencyAId, {
      name: `Cliente nuevo A ${suffix}`,
      brand: { color: '#fff' },
    });
    expect(created.agency_id).toBe(agencyAId);

    const updated = await clientsRepo.update(agencyAId, created.id, {
      name: `Cliente actualizado A ${suffix}`,
    });
    expect(updated?.name).toBe(`Cliente actualizado A ${suffix}`);

    const deleted = await clientsRepo.delete(agencyAId, created.id);
    expect(deleted).toBe(true);
  });
});
