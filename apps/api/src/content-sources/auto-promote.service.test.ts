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

    const service = new AutoPromoteService(
      sourceItems as never,
      posts as never,
      mediaAssets as never,
      approvals as never,
      socialAccounts as never,
      mediaStorage as never,
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
  });
});
