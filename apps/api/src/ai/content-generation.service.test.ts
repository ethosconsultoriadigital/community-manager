import { describe, expect, it, vi } from 'vitest';
import { ContentGenerationService } from './content-generation.service';

describe('ContentGenerationService', () => {
  it('genera imagen y post pending_approval con caption del usuario (sin LLM mock)', async () => {
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
        model: 'dall-e-3',
        provider: 'openai',
      }),
    };

    const service = new ContentGenerationService(
      posts as never,
      generations as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      image as never,
    );

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Promo verano visual',
      caption: 'Mi texto de promo',
      hashtags: ['#verano'],
      socialAccountIds: ['sa1'],
    });

    expect(image.generateImage).toHaveBeenCalledWith({
      brief: 'Promo verano visual',
      agencyId: 'agency-1',
    });
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
      }),
      'pending_approval',
    );
    expect(approvals.createPending).toHaveBeenCalledWith('post-1');
    expect(result.post?.status).toBe('pending_approval');
    expect(result.generations).toHaveLength(1);
    expect(result.media[0].source).toBe('ai_generated');
  });
});
