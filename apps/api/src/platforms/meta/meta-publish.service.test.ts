import { describe, expect, it, vi } from 'vitest';
import { MetaPublishService } from './meta-publish.service';

describe('MetaPublishService', () => {
  const inputBase = {
    externalAccountId: 'ig-1',
    accessToken: 'token',
    message: 'Hola #test',
    videoUrl: 'https://cdn.example.com/video.mp4',
  };

  it('publica video en feed de Instagram via REELS con share_to_feed', async () => {
    const meta = {
      createInstagramVideoMedia: vi.fn(),
      createInstagramReelsMedia: vi.fn().mockResolvedValue({ id: 'container-feed' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-post-1' }),
    };
    const service = new MetaPublishService(meta as never);

    await service.publish({
      platform: 'instagram',
      ...inputBase,
      videoFormat: 'feed',
    });

    expect(meta.createInstagramReelsMedia).toHaveBeenCalledWith(
      'ig-1',
      'token',
      inputBase.videoUrl,
      inputBase.message,
      true,
    );
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-feed', 'token');
    expect(meta.createInstagramVideoMedia).not.toHaveBeenCalled();
  });

  it('publica Reel en Instagram con share_to_feed desactivado', async () => {
    const meta = {
      createInstagramVideoMedia: vi.fn(),
      createInstagramReelsMedia: vi.fn().mockResolvedValue({ id: 'container-reel' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-reel-1' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'instagram',
      ...inputBase,
      videoFormat: 'reel',
    });

    expect(meta.createInstagramReelsMedia).toHaveBeenCalledWith(
      'ig-1',
      'token',
      inputBase.videoUrl,
      inputBase.message,
      false,
    );
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-reel', 'token');
    expect(meta.createInstagramVideoMedia).not.toHaveBeenCalled();
    expect(result.platformPostId).toBe('ig-reel-1');
  });

  it('Facebook ignora videoFormat y publica video en feed', async () => {
    const meta = {
      publishFacebookVideo: vi.fn().mockResolvedValue({ id: 'fb-video-1' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'facebook',
      ...inputBase,
      videoFormat: 'reel',
    });

    expect(meta.publishFacebookVideo).toHaveBeenCalled();
    expect(result.platformPostId).toBe('fb-video-1');
  });
});
