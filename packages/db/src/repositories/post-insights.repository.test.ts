import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptToken } from '@cm/shared';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ClientsRepository } from './clients.repository';
import { PostInsightsRepository } from './post-insights.repository';
import { PostsRepository } from './posts.repository';
import { SocialAccountsRepository } from './social-accounts.repository';

const KEY = randomBytes(32).toString('base64');
const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const socialRepo = new SocialAccountsRepository(prisma);
const postsRepo = new PostsRepository(prisma);
const insightsRepo = new PostInsightsRepository(prisma);

const suffix = Date.now();

describe('PostInsightsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let postAId: string;
  let targetAId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Insights A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Insights B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client ${suffix}` })).id;

    const enc = encryptToken('token', KEY);
    const account = await socialRepo.upsert({
      agencyId: agencyAId,
      clientId: clientAId,
      platform: 'facebook',
      externalAccountId: `fb-ins-${suffix}`,
      accessTokenEnc: enc,
      scopes: ['pages_read_engagement'],
    });

    const post = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Post métricas',
      socialAccountIds: [account.id],
    });
    postAId = post.id;
    targetAId = post.post_targets[0].id;

    await prisma.post_targets.update({
      where: { id: targetAId },
      data: { status: 'published', platform_post_id: 'fb-post-123', published_at: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.post_insights.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.post_targets.deleteMany({
      where: { posts: { agency_id: { in: [agencyAId, agencyBId] } } },
    });
    await prisma.posts.deleteMany({ where: { agency_id: { in: [agencyAId, agencyBId] } } });
    await prisma.social_accounts.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.clients.deleteMany({ where: { agency_id: { in: [agencyAId, agencyBId] } } });
    await prisma.agencies.deleteMany({ where: { id: { in: [agencyAId, agencyBId] } } });
    await disconnectPrisma();
  });

  it('upsert y consulta por post con aislamiento multi-tenant', async () => {
    await insightsRepo.upsert({
      agencyId: agencyAId,
      postTargetId: targetAId,
      impressions: 100,
      likes: 10,
      engagement: 15,
    });

    const forA = await insightsRepo.findByPostId(agencyAId, postAId);
    const forB = await insightsRepo.findByPostId(agencyBId, postAId);

    expect(forA).toHaveLength(1);
    expect(forA[0].impressions).toBe(100);
    expect(forB).toHaveLength(0);
  });

  it('resumen agrega totales por agencia', async () => {
    const summary = await insightsRepo.findSummary(agencyAId);
    expect(summary.withMetrics).toBeGreaterThanOrEqual(1);
    expect(summary.totals.impressions).toBeGreaterThanOrEqual(100);
    expect(summary.topPosts.length).toBeGreaterThanOrEqual(1);
  });
});
