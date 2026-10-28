import { describe, expect, it, vi } from 'vitest';
import { AutoPromoteService } from './auto-promote.service';

describe('AutoPromoteService', () => {
  it('crea un post por plataforma con copy y cuenta activa', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'noticia_1',
      copy_facebook: 'Hola FB',
      copy_instagram: 'Hola IG',
      hashtags: ['#mx'],
      source_url: 'https://radarmex.example/n1',
      image_url: null,
      post_id: null,
    };

    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPost: vi.fn().mockResolvedValue(true),
    };
    const posts = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'post-fb' })
        .mockResolvedValueOnce({ id: 'post-ig' }),
    };
    const mediaAssets = { create: vi.fn() };
    const approvals = { createPending: vi.fn().mockResolvedValue({}) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-fb', platform: 'facebook', is_active: true },
        { id: 'sa-ig', platform: 'instagram', is_active: true },
      ]),
    };
    const mediaStorage = { save: vi.fn() };
    const contentSources = {
      findById: vi.fn().mockResolvedValue({ config: {} }),
    };

    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      mediaStorage as never,
      contentSources as never,
      { get: vi.fn() } as never,
    );

    const result = await service.promoteSource('agency-1', 'user-1', 'source-1');

    expect(result.postsCreated).toBe(2);
    expect(posts.create).toHaveBeenCalledTimes(2);
    expect(posts.create.mock.calls[0][2].socialAccountIds).toEqual(['sa-fb']);
    expect(posts.create.mock.calls[0][2].caption).toContain('Hola FB');
    expect(posts.create.mock.calls[0][2].caption).toContain('#mx');
    expect(posts.create.mock.calls[0][2].caption).toContain('https://radarmex.example/n1');
    expect(posts.create.mock.calls[1][2].socialAccountIds).toEqual(['sa-ig']);
    expect(approvals.createPending).toHaveBeenCalledTimes(2);
    expect(sourceItems.linkPost).toHaveBeenCalledWith('agency-1', 'item-1', 'post-fb');
    expect(posts.create.mock.calls[0][2].alsoPublishAsStory).toBeUndefined();
  });

  it('Threads usa copy_x (formato corto) y no el de Facebook', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'noticia_1',
      copy_facebook: 'Texto muy largo de Facebook para feed',
      copy_instagram: 'Texto IG',
      copy_x: 'Copy corto X',
      hashtags: ['#mx'],
      source_url: 'https://radarmex.example/n1',
      image_url: null,
      post_id: null,
    };

    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPost: vi.fn().mockResolvedValue(true),
    };
    const posts = {
      create: vi.fn().mockResolvedValue({ id: 'post-th' }),
    };
    const mediaAssets = { create: vi.fn() };
    const approvals = { createPending: vi.fn().mockResolvedValue({}) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-th', platform: 'threads', is_active: true },
      ]),
    };
    const mediaStorage = { save: vi.fn() };
    const contentSources = {
      findById: vi.fn().mockResolvedValue({ config: {} }),
    };

    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      mediaStorage as never,
      contentSources as never,
      { get: vi.fn() } as never,
    );

    const result = await service.promoteSource('agency-1', 'user-1', 'source-1');

    expect(result.postsCreated).toBe(1);
    expect(posts.create).toHaveBeenCalledTimes(1);
    expect(posts.create.mock.calls[0][2].socialAccountIds).toEqual(['sa-th']);
    expect(posts.create.mock.calls[0][2].caption).toContain('Copy corto X');
    expect(posts.create.mock.calls[0][2].caption).not.toContain('Texto muy largo');
  });

  it('X usa copy_x y crea post si hay cuenta activa', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'noticia_1',
      copy_facebook: 'Texto largo FB',
      copy_instagram: 'Texto IG',
      copy_x: 'Tweet corto Radar',
      hashtags: ['#mx'],
      source_url: 'https://radarmex.example/n1',
      image_url: null,
      post_id: null,
    };

    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPost: vi.fn().mockResolvedValue(true),
    };
    const posts = {
      create: vi.fn().mockResolvedValue({ id: 'post-x' }),
    };
    const mediaAssets = { create: vi.fn() };
    const approvals = { createPending: vi.fn().mockResolvedValue({}) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-x', platform: 'x', is_active: true },
      ]),
    };
    const mediaStorage = { save: vi.fn() };
    const contentSources = {
      findById: vi.fn().mockResolvedValue({ config: {} }),
    };

    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      mediaStorage as never,
      contentSources as never,
      { get: vi.fn() } as never,
    );

    const result = await service.promoteSource('agency-1', 'user-1', 'source-1');

    expect(result.postsCreated).toBe(1);
    expect(posts.create).toHaveBeenCalledTimes(1);
    expect(posts.create.mock.calls[0][2].socialAccountIds).toEqual(['sa-x']);
    expect(posts.create.mock.calls[0][2].caption).toContain('Tweet corto Radar');
    expect(posts.create.mock.calls[0][2].caption).not.toContain('Texto largo FB');
  });

  it('no promueve a TikTok aunque la cuenta esté activa', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'noticia_1',
      copy_facebook: 'Hola FB',
      copy_instagram: 'Hola IG',
      hashtags: [],
      source_url: null,
      image_url: null,
      post_id: null,
    };
    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPost: vi.fn(),
    };
    const posts = { create: vi.fn() };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-tt', platform: 'tiktok', is_active: true },
      ]),
    };
    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      { create: vi.fn() } as never,
      { createPending: vi.fn() } as never,
      socialAccounts as never,
      { save: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue({ config: {} }) } as never,
      { get: vi.fn() } as never,
    );

    const result = await service.promoteSource('agency-1', null, 'source-1');

    expect(posts.create).not.toHaveBeenCalled();
    expect(result.postsCreated).toBe(0);
    expect(result.postIds).toEqual([]);
  });

  it('con allowlist solo usa esas cuentas y omite la red que no está', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'aab-1',
      copy_facebook: 'FB AAB',
      copy_instagram: 'IG AAB',
      copy_threads: 'Hilo AAB',
      copy_x: 'Post X',
      hashtags: ['#aab'],
      source_url: 'https://blog.example/nota',
      image_url: null,
      post_id: null,
    };
    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPost: vi.fn(),
      linkPosts: vi.fn().mockResolvedValue(true),
    };
    const posts = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'post-fb' })
        .mockResolvedValueOnce({ id: 'post-ig' }),
    };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-radar-fb', platform: 'facebook', is_active: true },
        { id: 'sa-aab-fb', platform: 'facebook', is_active: true },
        { id: 'sa-aab-ig', platform: 'instagram', is_active: true },
        { id: 'sa-radar-th', platform: 'threads', is_active: true },
      ]),
    };
    const contentSources = {
      findById: vi.fn().mockResolvedValue({
        config: {
          columnMap: 'aab',
          socialAccountIds: ['sa-aab-fb', 'sa-aab-ig'],
        },
      }),
    };
    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      { create: vi.fn() } as never,
      { createPending: vi.fn().mockResolvedValue({}) } as never,
      socialAccounts as never,
      { save: vi.fn() } as never,
      contentSources as never,
      { get: vi.fn() } as never,
    );

    const result = await service.promoteSource('agency-1', 'user-1', 'source-1');

    expect(result.postsCreated).toBe(2);
    expect(result.skippedNoAccount).toBe(2);
    expect(posts.create.mock.calls.map((call) => call[2].socialAccountIds)).toEqual([
      ['sa-aab-fb'],
      ['sa-aab-ig'],
    ]);
    expect(posts.create.mock.calls[0][2].caption).toContain('https://blog.example/nota');
    expect(sourceItems.linkPosts).toHaveBeenCalledWith('agency-1', 'item-1', ['post-fb', 'post-ig']);
    expect(sourceItems.linkPost).not.toHaveBeenCalled();
  });

  it('AAB manda Threads con copy_threads y no con post_x', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'aab-1',
      copy_facebook: 'Texto FB',
      copy_threads: 'Hilo propio',
      copy_x: 'Post de X',
      hashtags: [],
      source_url: 'https://origen.example/n',
      image_url: null,
      post_id: null,
    };
    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPosts: vi.fn().mockResolvedValue(true),
    };
    const posts = { create: vi.fn().mockResolvedValue({ id: 'post-th' }) };
    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      { create: vi.fn() } as never,
      { createPending: vi.fn() } as never,
      {
        findByAgency: vi.fn().mockResolvedValue([
          { id: 'sa-th', platform: 'threads', is_active: true },
        ]),
      } as never,
      { save: vi.fn() } as never,
      {
        findById: vi.fn().mockResolvedValue({
          config: { columnMap: 'aab', socialAccountIds: ['sa-th'] },
        }),
      } as never,
      { get: vi.fn() } as never,
    );

    await service.promoteSource('agency-1', null, 'source-1');

    expect(posts.create).toHaveBeenCalledTimes(1);
    expect(posts.create.mock.calls[0][2].caption).toContain('Hilo propio');
    expect(posts.create.mock.calls[0][2].caption).not.toContain('Post de X');
    expect(posts.create.mock.calls[0][2].caption).not.toContain('Texto FB');
  });

  it('AAB con portada de historia adjunta esa imagen a FB e IG y no al resto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => Uint8Array.from({ length: 160 }, () => 3).buffer,
      }),
    );
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'aab-1',
      copy_facebook: 'Hola FB',
      copy_instagram: 'Hola IG',
      copy_threads: 'Hilo',
      copy_x: 'Post X',
      hashtags: [],
      source_url: 'https://blog.example/n',
      image_url: 'https://cdn.example.com/banner.jpg',
      post_id: null,
    };
    const sourceItems = {
      findPromotable: vi.fn().mockResolvedValue([item]),
      linkPosts: vi.fn().mockResolvedValue(true),
      readStoryImageUrl: vi.fn().mockResolvedValue('https://cdn.example.com/vertical.jpg'),
    };
    const posts = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'post-fb' })
        .mockResolvedValueOnce({ id: 'post-ig' })
        .mockResolvedValueOnce({ id: 'post-th' })
        .mockResolvedValueOnce({ id: 'post-x' }),
    };
    const mediaAssets = { create: vi.fn().mockResolvedValue({}) };
    const mediaStorage = { save: vi.fn().mockResolvedValue({ storageUrl: 'https://r2.example/story.jpg' }) };
    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      mediaAssets as never,
      { createPending: vi.fn() } as never,
      {
        findByAgency: vi.fn().mockResolvedValue([
          { id: 'sa-fb', platform: 'facebook', is_active: true },
          { id: 'sa-ig', platform: 'instagram', is_active: true },
          { id: 'sa-th', platform: 'threads', is_active: true },
          { id: 'sa-x', platform: 'x', is_active: true },
        ]),
      } as never,
      mediaStorage as never,
      {
        findById: vi.fn().mockResolvedValue({
          config: { columnMap: 'aab', socialAccountIds: ['sa-fb', 'sa-ig', 'sa-th', 'sa-x'] },
        }),
      } as never,
      { get: vi.fn() } as never,
    );

    try {
      await service.promoteSource('agency-1', 'user-1', 'source-1');

      expect(posts.create.mock.calls.map((call) => call[2].alsoPublishAsStory)).toEqual([
        true,
        true,
        undefined,
        undefined,
      ]);
      const storyAssets = mediaAssets.create.mock.calls.filter((call) => call[1].position === 100);
      expect(storyAssets).toHaveLength(2);
      expect(storyAssets[0][1]).toMatchObject({
        postId: 'post-fb',
        storageUrl: 'https://r2.example/story.jpg',
        width: 1080,
        height: 1920,
      });
      expect(storyAssets[1][1].postId).toBe('post-ig');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('AAB sin portada de historia no marca story', async () => {
    const item = {
      id: 'item-1',
      client_id: 'client-1',
      source_id: 'source-1',
      external_id: 'aab-1',
      copy_facebook: 'Hola FB',
      hashtags: [],
      source_url: 'https://blog.example/n',
      image_url: null,
      post_id: null,
    };
    const posts = { create: vi.fn().mockResolvedValue({ id: 'post-fb' }) };
    const mediaAssets = { create: vi.fn() };
    const service = new AutoPromoteService(
      {
        findPromotable: vi.fn().mockResolvedValue([item]),
        linkPosts: vi.fn(),
        readStoryImageUrl: vi.fn().mockResolvedValue(null),
      } as never,
      posts as never,
      mediaAssets as never,
      { createPending: vi.fn() } as never,
      {
        findByAgency: vi.fn().mockResolvedValue([
          { id: 'sa-fb', platform: 'facebook', is_active: true },
        ]),
      } as never,
      { save: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue({ config: { columnMap: 'aab' } }) } as never,
      { get: vi.fn() } as never,
    );

    await service.promoteSource('agency-1', null, 'source-1');

    expect(posts.create.mock.calls[0][2].alsoPublishAsStory).toBeUndefined();
    expect(mediaAssets.create).not.toHaveBeenCalled();
  });
});
