import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ClientsRepository } from './clients.repository';
import { PostsRepository, PostsValidationError } from './posts.repository';
import { SocialAccountsRepository } from './social-accounts.repository';
import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';

const KEY = randomBytes(32).toString('base64');
const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const socialRepo = new SocialAccountsRepository(prisma);
const postsRepo = new PostsRepository(prisma);

const suffix = Date.now();

describe('PostsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let clientBId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Posts A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Posts B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client A ${suffix}` })).id;
    clientBId = (await clientsRepo.create(agencyBId, { name: `Client B ${suffix}` })).id;

    const enc = encryptToken('token', KEY);
    accountAId = (
      await socialRepo.upsert({
        agencyId: agencyAId,
        clientId: clientAId,
        platform: 'facebook',
        externalAccountId: `fb-a-${suffix}`,
        accessTokenEnc: enc,
        scopes: ['pages_show_list'],
      })
    ).id;

    accountBId = (
      await socialRepo.upsert({
        agencyId: agencyBId,
        clientId: clientBId,
        platform: 'facebook',
        externalAccountId: `fb-b-${suffix}`,
        accessTokenEnc: enc,
        scopes: ['pages_show_list'],
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.post_targets.deleteMany({
      where: { posts: { agency_id: { in: [agencyAId, agencyBId] } } },
    });
    await prisma.posts.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.social_accounts.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.clients.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('crea un post borrador con uno o más destinos', async () => {
    const post = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Hola mundo',
      hashtags: ['#test'],
      socialAccountIds: [accountAId],
    });

    expect(post.status).toBe('draft');
    expect(post.caption).toBe('Hola mundo');
    expect(post.post_targets).toHaveLength(1);
    expect(post.post_targets[0].social_account_id).toBe(accountAId);
  });

  it('rechaza destinos de otra agencia', async () => {
    await expect(
      postsRepo.create(agencyAId, null, {
        clientId: clientAId,
        caption: 'Cross tenant',
        socialAccountIds: [accountBId],
      }),
    ).rejects.toThrow(PostsValidationError);
  });

  it('aisla posts por agency_id', async () => {
    const created = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Solo A',
      socialAccountIds: [accountAId],
    });

    const forB = await postsRepo.findById(agencyBId, created.id);
    expect(forB).toBeNull();
  });
});
