import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ApprovalsRepository } from './approvals.repository';
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
const approvalsRepo = new ApprovalsRepository(prisma);

const suffix = Date.now();

describe('PostsRepository — programación y aprobación', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let accountAId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Schedule A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Schedule B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client A ${suffix}` })).id;

    const enc = encryptToken('token', KEY);
    accountAId = (
      await socialRepo.upsert({
        agencyId: agencyAId,
        clientId: clientAId,
        platform: 'facebook',
        externalAccountId: `fb-schedule-${suffix}`,
        accessTokenEnc: enc,
        scopes: ['pages_manage_posts'],
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.post_targets.deleteMany({
      where: { posts: { agency_id: { in: [agencyAId, agencyBId] } } },
    });
    await prisma.approvals.deleteMany({
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

  it('programa un post aprobado con fecha futura', async () => {
    const post = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Programado',
      socialAccountIds: [accountAId],
    });

    await postsRepo.submitForApproval(agencyAId, post.id);
    await approvalsRepo.approveLatest(agencyAId, post.id, null);
    await postsRepo.markApproved(agencyAId, post.id);

    const scheduledAt = new Date(Date.now() + 60_000);
    const scheduled = await postsRepo.schedule(agencyAId, post.id, scheduledAt);

    expect(scheduled?.status).toBe('scheduled');
    expect(scheduled?.scheduled_at?.toISOString()).toBe(scheduledAt.toISOString());
  });

  it('rechaza programar sin aprobación', async () => {
    const post = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Sin aprobar',
      socialAccountIds: [accountAId],
    });

    await expect(
      postsRepo.schedule(agencyAId, post.id, new Date(Date.now() + 60_000)),
    ).rejects.toThrow(PostsValidationError);
  });

  it('findDueForPublish solo incluye posts vencidos y aprobados', async () => {
    const post = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Vencido',
      socialAccountIds: [accountAId],
    });

    await postsRepo.submitForApproval(agencyAId, post.id);
    await approvalsRepo.approveLatest(agencyAId, post.id, null);
    await postsRepo.markApproved(agencyAId, post.id);

    const past = new Date(Date.now() - 60_000);
    await prisma.posts.update({
      where: { id: post.id },
      data: { status: 'scheduled', scheduled_at: past },
    });

    const due = await postsRepo.findDueForPublish(new Date());
    expect(due.some((p) => p.id === post.id)).toBe(true);
  });
});
