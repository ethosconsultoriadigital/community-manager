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
    const agencyIds = [agencyAId, agencyBId].filter(Boolean);
    if (agencyIds.length) {
      await prisma.media_assets.deleteMany({
        where: { agency_id: { in: agencyIds } },
      });
      await prisma.post_targets.deleteMany({
        where: { posts: { agency_id: { in: agencyIds } } },
      });
      await prisma.posts.deleteMany({
        where: { agency_id: { in: agencyIds } },
      });
      await prisma.social_accounts.deleteMany({
        where: { agency_id: { in: agencyIds } },
      });
      await prisma.clients.deleteMany({
        where: { agency_id: { in: agencyIds } },
      });
      await prisma.agencies.deleteMany({
        where: { id: { in: agencyIds } },
      });
    }
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

  it('duplica caption, destinos y media en un borrador independiente', async () => {
    const original = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Original para duplicar',
      hashtags: ['#dup'],
      socialAccountIds: [accountAId],
      placeId: 'place-1',
      placeName: 'Ciudad Test',
      alsoPublishAsStory: true,
    });

    await prisma.media_assets.create({
      data: {
        agency_id: agencyAId,
        post_id: original.id,
        type: 'image',
        source: 'upload',
        storage_url: `https://cdn.example.com/dup-${suffix}.jpg`,
        position: 0,
      },
    });

    await prisma.posts.update({
      where: { id: original.id },
      data: { status: 'published', published_at: new Date() },
    });

    const copy = await postsRepo.duplicate(agencyAId, original.id, null);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.status).toBe('draft');
    expect(copy!.caption).toBe('Original para duplicar');
    expect(copy!.hashtags).toEqual(['#dup']);
    expect(copy!.place_id).toBe('place-1');
    expect(copy!.place_name).toBe('Ciudad Test');
    expect(copy!.also_publish_as_story).toBe(true);
    expect(copy!.scheduled_at).toBeNull();
    expect(copy!.published_at).toBeNull();
    expect(copy!.post_targets).toHaveLength(1);
    expect(copy!.post_targets[0].social_account_id).toBe(accountAId);
    expect(copy!.post_targets[0].status).toBe('pending');
    expect(copy!.media_assets).toHaveLength(1);
    expect(copy!.media_assets[0].storage_url).toContain(`dup-${suffix}.jpg`);

    const stillOriginal = await postsRepo.findById(agencyAId, original.id);
    expect(stillOriginal!.status).toBe('published');
    expect(stillOriginal!.caption).toBe('Original para duplicar');
    expect(stillOriginal!.media_assets).toHaveLength(1);
    expect(copy!.media_assets[0].id).not.toBe(stillOriginal!.media_assets[0].id);
  });

  it('no permite duplicar un post de otra agencia', async () => {
    const created = await postsRepo.create(agencyAId, null, {
      clientId: clientAId,
      caption: 'Privado A',
      socialAccountIds: [accountAId],
    });
    const cross = await postsRepo.duplicate(agencyBId, created.id, null);
    expect(cross).toBeNull();
  });
});
