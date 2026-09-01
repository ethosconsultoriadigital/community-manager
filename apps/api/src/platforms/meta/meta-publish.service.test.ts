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

  it('Instagram feed + story publica ambos contenedores', async () => {
    const meta = {
      createInstagramReelsMedia: vi.fn().mockResolvedValue({ id: 'container-feed' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi
        .fn()
        .mockResolvedValueOnce({ id: 'ig-feed-1' })
        .mockResolvedValueOnce({ id: 'ig-story-1' }),
      createInstagramStoryVideoMedia: vi.fn().mockResolvedValue({ id: 'container-story' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'instagram',
      ...inputBase,
      videoFormat: 'feed',
      alsoPublishAsStory: true,
    });

    expect(meta.createInstagramStoryVideoMedia).toHaveBeenCalled();
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-feed', 'token');
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-story', 'token');
    expect(result.platformPostId).toBe('ig-feed-1');
    expect(result.storyPlatformPostId).toBe('ig-story-1');
    expect(result.storyStatus).toBe('published');
  });

  it('Instagram foto en feed espera contenedor antes de media_publish', async () => {
    const meta = {
      createInstagramMedia: vi.fn().mockResolvedValue({ id: 'container-image' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-photo-1' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'instagram',
      externalAccountId: 'ig-1',
      accessToken: 'token',
      message: 'Foto promo',
      imageUrl: 'https://cdn.example.com/img.jpg',
    });

    expect(meta.createInstagramMedia).toHaveBeenCalled();
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-image', 'token');
    expect(meta.publishInstagramMedia).toHaveBeenCalledWith('ig-1', 'token', 'container-image');
    expect(result.platformPostId).toBe('ig-photo-1');
  });

  it('Instagram foto + story espera ambos contenedores', async () => {
    const meta = {
      createInstagramMedia: vi.fn().mockResolvedValue({ id: 'container-feed' }),
      createInstagramStoryImageMedia: vi.fn().mockResolvedValue({ id: 'container-story' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi
        .fn()
        .mockResolvedValueOnce({ id: 'ig-feed-1' })
        .mockResolvedValueOnce({ id: 'ig-story-1' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'instagram',
      externalAccountId: 'ig-1',
      accessToken: 'token',
      message: 'Foto promo',
      imageUrl: 'https://cdn.example.com/img.jpg',
      alsoPublishAsStory: true,
    });

    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-feed', 'token');
    expect(meta.waitForInstagramContainer).toHaveBeenCalledWith('container-story', 'token');
    expect(result.platformPostId).toBe('ig-feed-1');
    expect(result.storyPlatformPostId).toBe('ig-story-1');
  });

  it('Facebook publica story antes que feed en foto', async () => {
    const calls: string[] = [];
    const meta = {
      uploadFacebookUnpublishedPhoto: vi.fn().mockImplementation(async () => {
        calls.push('upload');
        return { id: 'photo-1' };
      }),
      publishFacebookPhotoStory: vi.fn().mockImplementation(async () => {
        calls.push('story');
        return { post_id: 'story-1' };
      }),
      publishFacebookPhoto: vi.fn().mockImplementation(async () => {
        calls.push('feed');
        return { id: 'fb-photo-1' };
      }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'facebook',
      externalAccountId: 'page-1',
      accessToken: 'token',
      message: 'Caption',
      imageUrl: 'https://cdn.example.com/img.jpg',
      alsoPublishAsStory: true,
    });

    expect(calls).toEqual(['upload', 'story', 'feed']);
    expect(result.platformPostId).toBe('fb-photo-1');
    expect(result.storyPlatformPostId).toBe('story-1');
  });

  it('sin media marca story skipped', async () => {
    const meta = {
      publishFacebookFeed: vi.fn().mockResolvedValue({ id: 'fb-text-1' }),
    };
    const service = new MetaPublishService(meta as never);

    const result = await service.publish({
      platform: 'facebook',
      externalAccountId: 'page-1',
      accessToken: 'token',
      message: 'Solo texto',
      alsoPublishAsStory: true,
    });

    expect(result.storyStatus).toBe('skipped');
    expect(result.platformPostId).toBe('fb-text-1');
  });
});
