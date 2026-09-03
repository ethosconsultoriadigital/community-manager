import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ClientsRepository } from './clients.repository';
import { UsersRepository } from './users.repository';
import {
  UserClientAssignmentsRepository,
  UserClientAssignmentsValidationError,
} from './user-client-assignments.repository';

const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const usersRepo = new UsersRepository(prisma);
const assignmentsRepo = new UserClientAssignmentsRepository(prisma);

const suffix = Date.now();

describe('UserClientAssignmentsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let clientBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('TestPass123!', 4);
    agencyAId = (await agenciesRepo.create(`Assign A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Assign B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client A ${suffix}` })).id;
    clientBId = (await clientsRepo.create(agencyBId, { name: `Client B ${suffix}` })).id;

    userAId = (
      await usersRepo.create({
        agencyId: agencyAId,
        email: `manager-a-${suffix}@test.com`,
        passwordHash: hash,
        role: 'manager',
      })
    ).id;
    userBId = (
      await usersRepo.create({
        agencyId: agencyBId,
        email: `manager-b-${suffix}@test.com`,
        passwordHash: hash,
        role: 'manager',
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user_client_assignments.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.users.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await prisma.clients.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('asigna un usuario a un cliente de su agencia', async () => {
    const row = await assignmentsRepo.assign(agencyAId, {
      userId: userAId,
      clientId: clientAId,
    });

    expect(row.user_id).toBe(userAId);
    expect(row.client_id).toBe(clientAId);
    expect(row.clients.name).toContain(`Client A ${suffix}`);
  });

  it('impide asignar el mismo par usuario-cliente dos veces', async () => {
    await expect(
      assignmentsRepo.assign(agencyAId, { userId: userAId, clientId: clientAId }),
    ).rejects.toBeInstanceOf(UserClientAssignmentsValidationError);
  });

  it('permite asignar un segundo cliente distinto al mismo usuario', async () => {
    const secondClient = await clientsRepo.create(agencyAId, {
      name: `Client A2 ${suffix}`,
    });
    const row = await assignmentsRepo.assign(agencyAId, {
      userId: userAId,
      clientId: secondClient.id,
    });
    expect(row.client_id).toBe(secondClient.id);

    const all = await assignmentsRepo.findAllByUserId(agencyAId, userAId);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('impide asignar a un cliente de otra agencia', async () => {
    await expect(
      assignmentsRepo.assign(agencyBId, { userId: userBId, clientId: clientBId }),
    ).resolves.toBeDefined();

    await expect(
      assignmentsRepo.assign(agencyBId, { userId: userBId, clientId: clientAId }),
    ).rejects.toBeInstanceOf(UserClientAssignmentsValidationError);
  });

  it('lista asignaciones por agencia con usuario y cliente', async () => {
    const rows = await assignmentsRepo.findByAgency(agencyAId);
    expect(rows.some((r) => r.user_id === userAId && r.client_id === clientAId)).toBe(true);
  });
});
