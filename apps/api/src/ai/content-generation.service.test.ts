import { describe, expect, it, vi } from 'vitest';
import { ContentGenerationService } from './content-generation.service';

function createCompositionMocks() {
  const clients = {
    findById: vi.fn().mockResolvedValue({ id: 'client-1', brand: {} }),
  };
  const mediaStorage = { save: vi.fn(), readBytesFromUrl: vi.fn() };
  const composition = { compose: vi.fn() };
  const reelPipeline = { generate: vi.fn() };
  const avatarPipeline = { generate: vi.fn() };
  return { clients, mediaStorage, composition, reelPipeline, avatarPipeline };
}

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
    findById: vi.fn().mockResolvedValue(null),
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
  return {
    posts,
    generations,
    mediaAssets,
    approvals,
    socialAccounts,
    image,
    ...createCompositionMocks(),
  };
}

function buildService(mocks: ReturnType<typeof createImageMocks>) {
  return new ContentGenerationService(
    mocks.posts as never,
    mocks.generations as never,
    mocks.mediaAssets as never,
    mocks.approvals as never,
    mocks.socialAccounts as never,
    mocks.clients as never,
    mocks.mediaStorage as never,
    mocks.composition as never,
    mocks.reelPipeline as never,
    mocks.avatarPipeline as never,
    mocks.image as never,
  );
}

describe('ContentGenerationService', () => {
  it('genera imagen y post pending_approval con caption del usuario (sin LLM mock)', async () => {
    const mocks = createImageMocks();
    const service = buildService(mocks);

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Promo verano visual',
      caption: 'Mi texto de promo',
      hashtags: ['#verano'],
      socialAccountIds: ['sa1'],
    });

    expect(mocks.image.generateImage).toHaveBeenCalledWith(
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
    expect(mocks.mediaAssets.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({
        type: 'image',
        source: 'ai_generated',
        storageUrl: 'https://storage.local/ai.png',
      }),
    );
    expect(mocks.posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({
        caption: 'Mi texto de promo',
        hashtags: ['#verano'],
        socialAccountIds: ['sa1'],
      }),
      'pending_approval',
    );
    expect(mocks.approvals.createPending).toHaveBeenCalledWith('post-1');
    expect(result.post?.status).toBe('pending_approval');
    expect(result.posts).toHaveLength(1);
    expect(result.generations).toHaveLength(1);
    expect(result.media[0].source).toBe('ai_generated');
    expect(result.usedMock).toBe(false);
    expect(result.imageProvider).toBe('openai');
    expect(mocks.reelPipeline.generate).not.toHaveBeenCalled();
    expect(mocks.composition.compose).not.toHaveBeenCalled();
  });

  it('compone logo por código tras generar fondo (sin enviar logo a ImageProvider)', async () => {
    const mocks = createImageMocks();

    mocks.clients.findById.mockResolvedValue({
      id: 'client-1',
      brand: { logoUrl: 'https://storage.local/logo.png' },
    });
    mocks.composition.compose.mockResolvedValue({
      buffer: Buffer.from('png'),
      width: 1080,
      height: 1350,
    });
    mocks.mediaStorage.save.mockResolvedValue({
      storageUrl: 'https://storage.local/composed.png',
      storageKey: 'agency/composed.png',
    });

    const service = buildService(mocks);

    await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Fondo de café',
      caption: 'Promo 2x1',
      socialAccountIds: ['sa1'],
      composeLogoUrl: 'https://storage.local/logo.png',
      composeFields: { title: 'Promo 2x1' },
    });

    expect(mocks.image.generateImage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        composeLogoUrl: expect.anything(),
        logoUrl: expect.anything(),
      }),
    );
    expect(mocks.composition.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        background: 'https://storage.local/ai.png',
        logoUrl: 'https://storage.local/logo.png',
        fields: expect.objectContaining({ title: 'Promo 2x1' }),
      }),
    );
    expect(mocks.mediaAssets.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({
        storageUrl: 'https://storage.local/composed.png',
        width: 1080,
        height: 1350,
        source: 'ai_generated',
      }),
    );
  });

  it('crea un post por cada cuenta destino', async () => {
    const mocks = createImageMocks();
    mocks.posts.create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'post-fb', status: 'pending_approval' })
      .mockResolvedValueOnce({ id: 'post-ig', status: 'pending_approval' });
    mocks.posts.findById = vi
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
      });
    mocks.socialAccounts.findByAgency.mockResolvedValue([
      { id: 'sa-fb', platform: 'facebook', is_active: true },
      { id: 'sa-ig', platform: 'instagram', is_active: true },
    ]);

    const service = buildService(mocks);

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Brief',
      caption: 'Caption',
      socialAccountIds: ['sa-fb', 'sa-ig'],
    });

    expect(mocks.posts.create).toHaveBeenCalledTimes(2);
    expect(result.posts).toHaveLength(2);
    expect(result.post?.id).toBe('post-fb');
  });

  it('genera Reel vía pipeline multi-escena y post pending_approval', async () => {
    const mocks = createImageMocks();
    mocks.posts.create.mockResolvedValue({ id: 'post-reel', status: 'pending_approval' });
    mocks.posts.findById.mockResolvedValue({
      id: 'post-reel',
      status: 'pending_approval',
      video_format: 'reel',
      post_targets: [{ id: 't1' }],
    });
    mocks.generations.create.mockResolvedValue({ id: 'gen-video', status: 'pending' });
    mocks.generations.findById.mockResolvedValue({
      id: 'gen-video',
      kind: 'video',
      status: 'processing',
      model: 'pending-video',
      output: {
        job: {
          clientId: 'client-1',
          brief: 'Café en movimiento',
          caption: 'Nuestro latte del día',
          socialAccountIds: ['sa-ig'],
          referenceImageUrl: 'https://cdn.example/ref.jpg',
          sceneCount: 2,
          userId: 'user-1',
        },
      },
    });
    mocks.generations.findByPost.mockResolvedValue([
      { id: 'gen-video', kind: 'video', status: 'completed' },
    ]);
    mocks.mediaAssets.create.mockResolvedValue({
      id: 'media-v',
      storage_url: 'https://storage.local/reel.mp4',
      type: 'video',
    });
    mocks.mediaAssets.findByPost.mockResolvedValue([
      { id: 'media-v', type: 'video', source: 'ai_generated' },
    ]);
    mocks.socialAccounts.findByAgency.mockResolvedValue([
      { id: 'sa-ig', platform: 'instagram', is_active: true },
    ]);
    mocks.reelPipeline.generate.mockResolvedValue({
      url: 'https://storage.local/reel.mp4',
      width: 1080,
      height: 1920,
      model: 'fal-ai/minimax/video-01+fal-ai/minimax/video-01',
      provider: 'fal',
      usedMock: false,
      sceneCount: 2,
      multiScene: true,
      musicTrackId: 'upbeat-light',
      burnedSubtitles: true,
      durationSeconds: 10,
      sceneModels: ['fal-ai/minimax/video-01', 'fal-ai/minimax/video-01'],
    });

    const service = buildService(mocks);

    const started = await service.startReelFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Café en movimiento',
      caption: 'Nuestro latte del día',
      socialAccountIds: ['sa-ig'],
      referenceImageUrl: 'https://cdn.example/ref.jpg',
      sceneCount: 2,
    });
    expect(started.generationId).toBe('gen-video');

    await service.processReelJob('agency-1', 'gen-video');

    expect(mocks.reelPipeline.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'Café en movimiento',
        caption: 'Nuestro latte del día',
        referenceImageUrl: 'https://cdn.example/ref.jpg',
        agencyId: 'agency-1',
        sceneCount: 2,
      }),
    );
    expect(mocks.generations.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({ kind: 'video' }),
    );
    expect(mocks.posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({
        videoFormat: 'reel',
        socialAccountIds: ['sa-ig'],
      }),
      'pending_approval',
    );
    expect(mocks.mediaAssets.create).toHaveBeenCalledWith(
      'agency-1',
      expect.objectContaining({
        type: 'video',
        source: 'ai_generated',
        storageUrl: 'https://storage.local/reel.mp4',
        width: 1080,
        height: 1920,
      }),
    );
    expect(mocks.generations.updateStatus).toHaveBeenCalledWith(
      'agency-1',
      'gen-video',
      'completed',
      expect.objectContaining({
        output: expect.objectContaining({
          videoUrl: 'https://storage.local/reel.mp4',
          provider: 'fal',
        }),
      }),
    );
  });

  it('avatar async: start + process crea post pending_approval', async () => {
    const mocks = createImageMocks();
    mocks.posts.create.mockResolvedValue({ id: 'post-avatar', status: 'pending_approval' });
    mocks.posts.findById.mockResolvedValue({
      id: 'post-avatar',
      status: 'pending_approval',
      video_format: 'reel',
      post_targets: [{ id: 't1' }],
    });
    mocks.generations.create.mockResolvedValue({ id: 'gen-avatar', status: 'pending' });
    mocks.generations.findById = vi.fn().mockResolvedValue({
      id: 'gen-avatar',
      kind: 'avatar_video',
      status: 'processing',
      model: 'pending-avatar',
      output: {
        job: {
          clientId: 'client-1',
          brief: 'Saludo del personaje',
          caption: 'Hola comunidad',
          socialAccountIds: ['sa-ig'],
          characterImageUrl: 'https://cdn.example/char.png',
          userId: 'user-1',
        },
      },
    });
    mocks.generations.findByPost.mockResolvedValue([
      { id: 'gen-avatar', kind: 'avatar_video', status: 'completed' },
    ]);
    mocks.mediaAssets.create.mockResolvedValue({
      id: 'media-a',
      storage_url: 'https://storage.local/avatar.mp4',
      type: 'video',
    });
    mocks.mediaAssets.findByPost.mockResolvedValue([
      { id: 'media-a', type: 'video', source: 'ai_generated' },
    ]);
    mocks.socialAccounts.findByAgency.mockResolvedValue([
      { id: 'sa-ig', platform: 'instagram', is_active: true },
    ]);
    mocks.avatarPipeline.generate.mockResolvedValue({
      url: 'https://storage.local/avatar.mp4',
      width: 1080,
      height: 1920,
      model: 'fal-ai/sadtalker',
      ttsProvider: 'elevenlabs',
      lipsyncProvider: 'fal',
      usedMock: false,
      burnedSubtitles: true,
      durationSeconds: 12,
      spokenTextPreview: 'Hola',
    });

    const service = buildService(mocks);

    const started = await service.startAvatarFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Saludo del personaje',
      caption: 'Hola comunidad',
      socialAccountIds: ['sa-ig'],
      characterImageUrl: 'https://cdn.example/char.png',
    });
    expect(started.generationId).toBe('gen-avatar');
    expect(started.status).toBe('processing');

    await service.processAvatarJob('agency-1', 'gen-avatar');

    expect(mocks.avatarPipeline.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'Saludo del personaje',
        characterImageUrl: 'https://cdn.example/char.png',
      }),
    );
    expect(mocks.posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({ videoFormat: 'reel' }),
      'pending_approval',
    );
    expect(mocks.generations.updateStatus).toHaveBeenCalledWith(
      'agency-1',
      'gen-avatar',
      'completed',
      expect.objectContaining({
        output: expect.objectContaining({
          videoUrl: 'https://storage.local/avatar.mp4',
          postIds: ['post-avatar'],
        }),
      }),
    );
  });
});
