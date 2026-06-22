import { describe, expect, it, vi } from 'vitest';
import { ContentGenerationService } from './content-generation.service';

describe('ContentGenerationService', () => {
  it('genera copy, imagen y post pending_approval con generaciones registradas', async () => {
    const posts = {
      create: vi.fn().mockResolvedValue({
        id: 'post-1',
        status: 'pending_approval',
        caption: '[Mock LLM] Brief',
        hashtags: ['#mock'],
        post_targets: [],
      }),
      findById: vi.fn().mockResolvedValue({
        id: 'post-1',
        status: 'pending_approval',
        caption: '[Mock LLM] Brief',
        hashtags: ['#mock'],
        post_targets: [{ id: 't1' }],
      }),
    };
    const generations = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: 'gen-copy', status: 'pending' })
        .mockResolvedValueOnce({ id: 'gen-image', status: 'pending' }),
      updateStatus: vi.fn().mockResolvedValue({}),
      linkPost: vi.fn().mockResolvedValue(true),
      findByPost: vi.fn().mockResolvedValue([
        { id: 'gen-copy', kind: 'copy', status: 'completed' },
        { id: 'gen-image', kind: 'image', status: 'completed' },
      ]),
    };
    const mediaAssets = {
      create: vi.fn().mockResolvedValue({ id: 'media-1', storage_url: 'https://mock-canva.local/x.png' }),
      findByPost: vi.fn().mockResolvedValue([{ id: 'media-1', source: 'canva' }]),
    };
    const approvals = { createPending: vi.fn().mockResolvedValue({ id: 'ap-1' }) };
    const socialAccounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'sa1', platform: 'facebook', is_active: true },
      ]),
    };
    const llm = {
      generateCopy: vi.fn().mockResolvedValue({
        caption: '[Mock LLM] Brief',
        hashtags: ['#mock'],
        byPlatform: { facebook: { caption: 'x', hashtags: ['#mock'] } },
      }),
    };
    const image = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://picsum.photos/seed/abc/1080/1080',
        width: 1080,
        height: 1080,
      }),
    };
    const canva = {
      composeFlyer: vi.fn().mockResolvedValue({
        url: 'https://mock-canva.local/export/abc.png',
        templateId: 'mock-brand-template',
      }),
    };

    const service = new ContentGenerationService(
      posts as never,
      generations as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      llm as never,
      image as never,
      canva as never,
    );

    const result = await service.generateFromBrief('agency-1', 'user-1', {
      clientId: 'client-1',
      brief: 'Promo verano',
      socialAccountIds: ['sa1'],
    });

    expect(llm.generateCopy).toHaveBeenCalled();
    expect(image.generateImage).toHaveBeenCalled();
    expect(canva.composeFlyer).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: 'Promo verano',
        agencyId: 'agency-1',
        clientId: 'client-1',
      }),
    );
    expect(posts.create).toHaveBeenCalledWith(
      'agency-1',
      'user-1',
      expect.objectContaining({ caption: '[Mock LLM] Brief' }),
      'pending_approval',
    );
    expect(approvals.createPending).toHaveBeenCalledWith('post-1');
    expect(result.post?.status).toBe('pending_approval');
    expect(result.generations).toHaveLength(2);
    expect(result.media[0].source).toBe('canva');
  });
});
