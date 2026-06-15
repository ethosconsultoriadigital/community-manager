import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PublishPostService } from './publish-post.service';

const ENCRYPTION_KEY = randomBytes(32).toString('base64');

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  const posts = {
    findForPublish: vi.fn(),
    markPublishing: vi.fn(),
    updateTargetStatus: vi.fn(),
    refreshAggregateStatus: vi.fn(),
  };
  const approvals = { hasApproved: vi.fn() };
  const socialAccounts = { findByIdWithToken: vi.fn() };
  const metaPublish = { publish: vi.fn() };
  const config = { get: vi.fn().mockReturnValue(ENCRYPTION_KEY) };

  const service = new PublishPostService(
    config as never,
    { ...posts, ...overrides.posts } as never,
    approvals as never,
    socialAccounts as never,
    metaPublish as never,
  );

  return { service, posts, socialAccounts, metaPublish };
}

function encryptedToken(plain = 'page-token') {
  return encryptToken(plain, ENCRYPTION_KEY);
}

describe('PublishPostService', () => {
  it('no publica sin aprobación', async () => {
    const { service, posts } = createService();
    posts.findForPublish.mockResolvedValue({
      id: 'post-1',
      status: 'scheduled',
      caption: 'Hola',
      hashtags: [],
      approvals: [],
      media_assets: [],
      post_targets: [{ id: 't1', status: 'pending', social_account_id: 'sa1' }],
    });

    await service.publishPost({ agencyId: 'a1', postId: 'post-1' });
    expect(posts.markPublishing).not.toHaveBeenCalled();
  });

  it('publica destino facebook y marca published', async () => {
    const { service, posts, socialAccounts, metaPublish } = createService();
    posts.findForPublish.mockResolvedValue({
      id: 'post-1',
      status: 'scheduled',
      caption: 'Hola',
      hashtags: ['#test'],
      approvals: [{ id: 'ap1', status: 'approved' }],
      media_assets: [],
      post_targets: [
        {
          id: 't1',
          status: 'pending',
          social_account_id: 'sa1',
        },
      ],
    });
    socialAccounts.findByIdWithToken.mockResolvedValue({
      id: 'sa1',
      platform: 'facebook',
      external_account_id: 'page-1',
      access_token_enc: encryptedToken(),
      is_active: true,
    });
    metaPublish.publish.mockResolvedValue({ platformPostId: 'fb-123' });

    await service.publishPost({ agencyId: 'a1', postId: 'post-1' });

    expect(posts.markPublishing).toHaveBeenCalledWith('a1', 'post-1');
    expect(metaPublish.publish).toHaveBeenCalled();
    expect(posts.updateTargetStatus).toHaveBeenCalledWith(
      'a1',
      'post-1',
      't1',
      expect.objectContaining({ status: 'published', platformPostId: 'fb-123' }),
    );
    expect(posts.refreshAggregateStatus).toHaveBeenCalledWith('a1', 'post-1');
  });

  it('omite destinos ya publicados en reintento', async () => {
    const { service, posts, socialAccounts, metaPublish } = createService();
    posts.findForPublish.mockResolvedValue({
      id: 'post-1',
      status: 'publishing',
      caption: 'Hola',
      hashtags: [],
      approvals: [{ id: 'ap1', status: 'approved' }],
      media_assets: [],
      post_targets: [
        { id: 't1', status: 'published', social_account_id: 'sa1' },
        { id: 't2', status: 'failed', social_account_id: 'sa2' },
      ],
    });
    socialAccounts.findByIdWithToken.mockResolvedValue({
      id: 'sa2',
      platform: 'facebook',
      external_account_id: 'page-2',
      access_token_enc: encryptedToken(),
      is_active: true,
    });
    metaPublish.publish.mockResolvedValue({ platformPostId: 'fb-456' });

    await service.publishPost({ agencyId: 'a1', postId: 'post-1' });

    expect(metaPublish.publish).toHaveBeenCalledTimes(1);
    expect(socialAccounts.findByIdWithToken).toHaveBeenCalledWith('a1', 'sa2');
  });

  it('incrementa intentos y marca failed cuando falla la publicación', async () => {
    const { service, posts, socialAccounts, metaPublish } = createService();
    posts.findForPublish.mockResolvedValue({
      id: 'post-1',
      status: 'scheduled',
      caption: 'Hola',
      hashtags: [],
      approvals: [{ id: 'ap1', status: 'approved' }],
      media_assets: [],
      post_targets: [{ id: 't1', status: 'pending', social_account_id: 'sa1' }],
    });
    socialAccounts.findByIdWithToken.mockResolvedValue({
      id: 'sa1',
      platform: 'facebook',
      external_account_id: 'page-1',
      access_token_enc: encryptedToken(),
      is_active: true,
    });
    metaPublish.publish.mockRejectedValue(new Error('Graph API down'));

    await expect(
      service.publishPost({ agencyId: 'a1', postId: 'post-1' }),
    ).rejects.toThrow('Graph API down');

    expect(posts.updateTargetStatus).toHaveBeenCalledWith(
      'a1',
      'post-1',
      't1',
      expect.objectContaining({ status: 'failed', incrementAttempts: true }),
    );
  });

  it('buildMessage combina caption y hashtags', () => {
    const { service } = createService();
    expect(service.buildMessage('Hola', ['#a', '#b'])).toBe('Hola\n\n#a #b');
  });
});
