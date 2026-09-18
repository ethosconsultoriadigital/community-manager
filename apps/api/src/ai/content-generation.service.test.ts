import { describe, expect, it, vi } from 'vitest';
import { ContentGenerationService } from './content-generation.service';

function createImageMocks() {
  const posts = {
    create: vi.fn().mockResolvedValue({
      id: 'post-1',
      status: 'pending_approval',
      caption: 'Mi texto de promo',
      hashtags: ['#verano'],
      post_targets: [],
    }),
    findById: vi.fn().mockResolvedValue({
      id: 'post-1',
      status: 'pending_approval',
      caption: 'Mi texto de promo',
      hashtags: ['#verano'],
      post_targets: [{ id: 't1' }],
    }),
  };
  const generations = {
    create: vi.fn().mockResolvedValue({ id: 'gen-image', status: 'pending' }),
    updateStatus: vi.fn().mockResolvedValue({}),
    linkPost: vi.fn().mockResolvedValue(true),
    findByPost: vi.fn().mockResolvedValue([
      { id: 'gen-image', kind: 'image', status: 'completed' },
    ]),
  };
  const mediaAssets = {
    create: vi.fn().mockResolvedValue({
      id: 'media-1',
      storage_url: 'https://storage.local/ai.png',
    }),
    findByPost: vi.fn().mockResolvedValue([{ id: 'media-1', source: 'ai_generated' }]),
  };
  const approvals = { createPending: vi.fn().mockResolvedValue({ id: 'ap-1' }) };
  const socialAccounts = {
    findByAgency: vi.fn().mockResolvedValue([
      { id: 'sa1', platform: 'facebook', is_active: true },
    ]),
  };
  const image = {
    generateImage: vi.fn().mockResolvedValue({
      url: 'https://storage.local/ai.png',
      width: 1024,
      height: 1024,
      model: 'gpt-image-2',
      provider: 'openai',
    }),
  };
  const video = { generateVideo: vi.fn() };
  return { posts, generations, mediaAssets, approvals, socialAccounts, image, video };
}

describe('ContentGenerationService', () => {
  it('genera imagen y post pending_approval con caption del usuario (sin LLM mock)', async () => {
    const { posts, generations, mediaAssets, approvals, socialAccounts, image, video } =
      createImageMocks();

    const service = new ContentGenerationService(
      posts as never,
      generations as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      image as never,
      video as never,
    );

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Promo verano visual',
      caption: 'Mi texto de promo',
      hashtags: ['#verano'],
      socialAccountIds: ['sa1'],
    });

    expect(image.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'Promo verano visual',
        caption: 'Mi texto de promo',
        hashtags: ['#verano'],
        agencyId: 'agency-1',
        imageSize: '1024x1024',
        platformPresets: expect.arrayContaining([
          expect.objectContaining({ platform: 'facebook' }),
        ]),
      }),
    );
    expect(mediaAssets.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({
        type: 'image',
        source: 'ai_generated',
        storageUrl: 'https://storage.local/ai.png',
      }),
    );
    expect(posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({
        caption: 'Mi texto de promo',
        hashtags: ['#verano'],
        socialAccountIds: ['sa1'],
      }),
      'pending_approval',
    );
    expect(approvals.createPending).toHaveBeenCalledWith('post-1');
    expect(result.post?.status).toBe('pending_approval');
    expect(result.posts).toHaveLength(1);
    expect(result.generations).toHaveLength(1);
    expect(result.media[0].source).toBe('ai_generated');
    expect(result.usedMock).toBe(false);
    expect(result.imageProvider).toBe('openai');
    expect(video.generateVideo).not.toHaveBeenCalled();
  });

  it('crea un post por cada cuenta destino', async () => {
    const posts = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'post-fb', status: 'pending_approval' })
        .mockResolvedValueOnce({ id: 'post-ig', status: 'pending_approval' }),
      findById: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'post-fb',
          status: 'pending_approval',
          post_targets: [{ id: 't-fb' }],
        })
        .mockResolvedValueOnce({
          id: 'post-ig',
          status: 'pending_approval',
          post_targets: [{ id: 't-ig' }],
        }),
    };
    const generations = {
      create: vi.fn().mockResolvedValue({ id: 'gen-image', status: 'pending' }),
      updateStatus: vi.fn().mockResolvedValue({}),
      linkPost: vi.fn().mockResolvedValue(true),
      findByPost: vi.fn().mockResolvedValue([]),
    };
    const mediaAssets = {
      create: vi.fn().mockResolvedValue({ id: 'media-1', storage_url: 'https://x/a.png' }),
      findByPost: vi.fn().mockResolvedValue([{ id: 'media-1', source: 'ai_generated' }]),
    };
    const approvals = { createPending: vi.fn().mockResolvedValue({ id: 'ap-1' }) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-fb', platform: 'facebook', is_active: true },
        { id: 'sa-ig', platform: 'instagram', is_active: true },
      ]),
    };
    const image = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://x/a.png',
        width: 1024,
        height: 1024,
        model: 'gpt-image-2',
        provider: 'openai',
      }),
    };
    const video = { generateVideo: vi.fn() };

    const service = new ContentGenerationService(
      posts as never,
      generations as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      image as never,
      video as never,
    );

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Brief',
      caption: 'Caption',
      socialAccountIds: ['sa-fb', 'sa-ig'],
    });

    expect(posts.create).toHaveBeenCalledTimes(2);
    expect(result.posts).toHaveLength(2);
    expect(result.post?.id).toBe('post-fb');
  });

  it('genera Reel (video) y post pending_approval con video_format reel', async () => {
    const posts = {
      create: vi.fn().mockResolvedValue({ id: 'post-reel', status: 'pending_approval' }),
      findById: vi.fn().mockResolvedValue({
        id: 'post-reel',
        status: 'pending_approval',
        video_format: 'reel',
        post_targets: [{ id: 't1' }],
      }),
    };
    const generations = {
      create: vi.fn().mockResolvedValue({ id: 'gen-video', status: 'pending' }),
      updateStatus: vi.fn().mockResolvedValue({}),
      linkPost: vi.fn().mockResolvedValue(true),
      findByPost: vi.fn().mockResolvedValue([
        { id: 'gen-video', kind: 'video', status: 'completed' },
      ]),
    };
    const mediaAssets = {
      create: vi.fn().mockResolvedValue({
        id: 'media-v',
        storage_url: 'https://storage.local/ai.mp4',
        type: 'video',
      }),
      findByPost: vi.fn().mockResolvedValue([
        { id: 'media-v', type: 'video', source: 'ai_generated' },
      ]),
    };
    const approvals = { createPending: vi.fn().mockResolvedValue({ id: 'ap-1' }) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa-ig', platform: 'instagram', is_active: true },
      ]),
    };
    const image = { generateImage: vi.fn() };
    const video = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://storage.local/ai.mp4',
        width: 720,
        height: 1280,
        model: 'fal-ai/minimax/video-01',
        provider: 'fal',
      }),
    };

    const service = new ContentGenerationService(
      posts as never,
      generations as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      image as never,
      video as never,
    );

    const result = await service.generateReelFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Café en movimiento',
      caption: 'Nuestro latte del día',
      socialAccountIds: ['sa-ig'],
      referenceImageUrl: 'https://cdn.example/ref.jpg',
    });

    expect(video.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Café en movimiento',
        caption: 'Nuestro latte del día',
        referenceImageUrl: 'https://cdn.example/ref.jpg',
        agencyId: 'agency-1',
      }),
    );
    expect(generations.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({ kind: 'video' }),
    );
    expect(posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({
        videoFormat: 'reel',
        socialAccountIds: ['sa-ig'],
      }),
      'pending_approval',
    );
    expect(mediaAssets.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({
        type: 'video',
        source: 'ai_generated',
        storageUrl: 'https://storage.local/ai.mp4',
      }),
    );
    expect(image.generateImage).not.toHaveBeenCalled();
    expect(result.usedMock).toBe(false);
    expect(result.videoProvider).toBe('fal');
    expect(result.posts).toHaveLength(1);
  });
});
