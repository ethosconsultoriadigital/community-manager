import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from '../repositories/agencies.repository';
import { ClientsRepository } from '../repositories/clients.repository';
import { PostsRepository } from '../repositories/posts.repository';
import { UserClientAssignmentsRepository } from '../repositories/user-client-assignments.repository';
import { UsersRepository } from '../repositories/users.repository';
import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';

const KEY = randomBytes(32).toString('base64');
const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const usersRepo = new UsersRepository(prisma);
const assignmentsRepo = new UserClientAssignmentsRepository(prisma);
const postsRepo = new PostsRepository(prisma);

const suffix = Date.now();

describe('aislamiento por cliente asignado (Fase B)', () => {
  let agencyId: string;
  let clientAId: string;
  let clientBId: string;
  let managerAId: string;
  let managerBId: string;
  let accountAId: string;
  let accountBId: string;
  let postAId: string;
  let postBId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('TestPass123!', 4);
    agencyId = (await agenciesRepo.create(`Scope Agency ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyId, { name: `Client A ${suffix}` })).id;
    clientBId = (await clientsRepo.create(agencyId, { name: `Client B ${suffix}` })).id;

    managerAId = (
      await usersRepo.create({
        agencyId,
        email: `manager-a-${suffix}@test.com`,
        passwordHash: hash,
        role: 'manager',
      })
    ).id;
    managerBId = (
      await usersRepo.create({
        agencyId,
        email: `manager-b-${suffix}@test.com`,
        passwordHash: hash,
        role: 'manager',
      })
    ).id;

    await assignmentsRepo.assign(agencyId, { userId: managerAId, clientId: clientAId });
    await assignmentsRepo.assign(agencyId, { userId: managerBId, clientId: clientBId });

    const enc = encryptToken('token', KEY);
    const { SocialAccountsRepository } = await import('../repositories/social-accounts.repository');
    const socialRepo = new SocialAccountsRepository(prisma);
    accountAId = (
      await socialRepo.upsert({
        agencyId,
        clientId: clientAId,
        platform: 'facebook',
        externalAccountId: `fb-a-${suffix}`,
        accessTokenEnc: enc,
        scopes: ['pages_show_list'],
      })
    ).id;
    accountBId = (
      await socialRepo.upsert({
        agencyId,
        clientId: clientBId,
        platform: 'facebook',
        externalAccountId: `fb-b-${suffix}`,
        accessTokenEnc: enc,
        scopes: ['pages_show_list'],
      })
    ).id;

    postAId = (
      await postsRepo.create(agencyId, managerAId, {
        clientId: clientAId,
        caption: 'Post A',
        hashtags: [],
        socialAccountIds: [accountAId],
      })
    ).id;
    postBId = (
      await postsRepo.create(agencyId, managerBId, {
        clientId: clientBId,
        caption: 'Post B',
        hashtags: [],
        socialAccountIds: [accountBId],
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.post_targets.deleteMany({ where: { posts: { agency_id: agencyId } } });
    await prisma.posts.deleteMany({ where: { agency_id: agencyId } });
    await prisma.social_accounts.deleteMany({ where: { agency_id: agencyId } });
    await prisma.user_client_assignments.deleteMany({ where: { agency_id: agencyId } });
    await prisma.users.deleteMany({ where: { agency_id: agencyId } });
    await prisma.clients.deleteMany({ where: { agency_id: agencyId } });
    await prisma.agencies.deleteMany({ where: { id: agencyId } });
    await disconnectPrisma();
  });

  it('manager A solo ve posts del client A al filtrar por clientId', async () => {
    const assignment = await assignmentsRepo.findByUserId(agencyId, managerAId);
    expect(assignment?.client_id).toBe(clientAId);

    const postsForA = await postsRepo.findAll(agencyId, assignment!.client_id);
    const ids = postsForA.map((p) => p.id);
    expect(ids).toContain(postAId);
    expect(ids).not.toContain(postBId);
  });

  it('manager B no puede leer post de client A por id sin filtro cruzado', async () => {
    const assignment = await assignmentsRepo.findByUserId(agencyId, managerBId);
    const postsForB = await postsRepo.findAll(agencyId, assignment!.client_id);
    expect(postsForB.map((p) => p.id)).not.toContain(postAId);
  });
});
