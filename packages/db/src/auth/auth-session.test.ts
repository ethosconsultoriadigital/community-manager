import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from '../repositories/agencies.repository';
import { ClientsRepository } from '../repositories/clients.repository';
import { UsersRepository } from '../repositories/users.repository';

const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const usersRepo = new UsersRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);

const suffix = Date.now();
const password = 'TestPass123!';

describe('auth + aislamiento por sesión (agency del usuario)', () => {
  let agencyAId: string;
  let agencyBId: string;
  let userAId: string;
  let userBId: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 4);

    const agencyA = await agenciesRepo.create(`Auth Agency A ${suffix}`);
    const agencyB = await agenciesRepo.create(`Auth Agency B ${suffix}`);
    agencyAId = agencyA.id;
    agencyBId = agencyB.id;

    const userA = await usersRepo.create({
      agencyId: agencyAId,
      email: `user-a-${suffix}@test.com`,
      passwordHash: hash,
      role: 'owner',
    });
    const userB = await usersRepo.create({
      agencyId: agencyBId,
      email: `user-b-${suffix}@test.com`,
      passwordHash: hash,
      role: 'owner',
    });
    userAId = userA.id;
    userBId = userB.id;

    const clientA = await clientsRepo.create(agencyAId, { name: `Client A ${suffix}` });
    const clientB = await clientsRepo.create(agencyBId, { name: `Client B ${suffix}` });
    clientAId = clientA.id;
    clientBId = clientB.id;
  });

  afterAll(async () => {
    await prisma.clients.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.users.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('login devuelve usuario con su agency_id', async () => {
    const user = await usersRepo.findByEmail(`user-a-${suffix}@test.com`);
    expect(user).not.toBeNull();
    expect(user?.agency_id).toBe(agencyAId);
    expect(await bcrypt.compare(password, user!.password_hash)).toBe(true);
  });

  it('usuario A solo ve clientes de su agencia (simula sesión)', async () => {
    const userA = await usersRepo.findById(userAId);
    const clientsForA = await clientsRepo.findAll(userA!.agency_id);

    expect(clientsForA.map((c) => c.id)).toContain(clientAId);
    expect(clientsForA.map((c) => c.id)).not.toContain(clientBId);
  });

  it('usuario B solo ve clientes de su agencia (simula sesión)', async () => {
    const userB = await usersRepo.findById(userBId);
    const clientsForB = await clientsRepo.findAll(userB!.agency_id);

    expect(clientsForB.map((c) => c.id)).toContain(clientBId);
    expect(clientsForB.map((c) => c.id)).not.toContain(clientAId);
  });

  it('no puede acceder al cliente de otra agencia aunque conozca el id', async () => {
    const userA = await usersRepo.findById(userAId);
    const crossAccess = await clientsRepo.findById(userA!.agency_id, clientBId);
    expect(crossAccess).toBeNull();
  });
});
