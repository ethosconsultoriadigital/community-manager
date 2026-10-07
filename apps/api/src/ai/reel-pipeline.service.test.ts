import { describe, expect, it, vi } from 'vitest';
import { ReelPipelineService } from './reel-pipeline.service';

describe('ReelPipelineService', () => {
  it('multi-escena: keyframe por escena + i2v + concat', async () => {
    const config = {
      get: (key: string) => (key === 'REEL_MULTI_SCENE' ? 'true' : undefined),
    };
    const script = {
      buildReelScript: vi.fn().mockResolvedValue({
        scenes: [
          {
            id: '1',
            visualPrompt: 'scene1 visual',
            motionPrompt: 'scene1 motion',
            subtitle: 'Hola',
            durationHintSeconds: 5,
          },
          {
            id: '2',
            visualPrompt: 'scene2 visual',
            motionPrompt: 'scene2 motion',
            subtitle: '',
            durationHintSeconds: 5,
          },
        ],
        musicSuggestion: 'upbeat',
      }),
    };
    const composition = {
      concatClips: vi.fn().mockResolvedValue({
        buffer: Buffer.from('mp4'),
        width: 1080,
        height: 1920,
        musicTrackId: 'upbeat-light',
        burnedSubtitles: true,
        durationSeconds: 10,
      }),
      downloadClip: vi.fn(),
      probeClipDuration: vi.fn().mockResolvedValue(5),
    };
    const mediaStorage = {
      save: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/final.mp4',
        storageKey: 'k',
      }),
      readBytesFromUrl: vi.fn().mockResolvedValue({
        buffer: Buffer.from('clip'),
        contentType: 'video/mp4',
      }),
    };
    const image = {
      generateImage: vi
        .fn()
        .mockResolvedValueOnce({
          url: 'https://img/1.png',
          width: 1024,
          height: 1792,
          provider: 'openai',
          model: 'gpt-image-2',
        })
        .mockResolvedValueOnce({
          url: 'https://img/2.png',
          width: 1024,
          height: 1792,
          provider: 'openai',
          model: 'gpt-image-2',
        }),
    };
    const video = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://vid/clip.mp4',
        width: 720,
        height: 1280,
        provider: 'fal',
        model: 'fal-ai/minimax/video-01/image-to-video',
      }),
    };

    const service = new ReelPipelineService(
      config as never,
      script as never,
      composition as never,
      mediaStorage as never,
      image as never,
      video as never,
    );

    const result = await service.generate({
      agencyId: 'agency-1',
      brief: 'Café',
      caption: 'Latte del día',
      referenceImageUrl: 'https://cdn/ref.jpg',
      sceneCount: 2,
    });

    expect(script.buildReelScript).toHaveBeenCalled();
    // Escena 1 usa foto de referencia; escena 2 genera keyframe
    expect(image.generateImage).toHaveBeenCalledTimes(1);
    expect(video.generateVideo).toHaveBeenCalledTimes(2);
    expect(video.generateVideo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        referenceImageUrl: 'https://cdn/ref.jpg',
        prompt: 'scene1 motion',
      }),
    );
    expect(composition.concatClips).toHaveBeenCalledWith(
      expect.objectContaining({
        clips: expect.any(Array),
        withMusic: true,
        burnSubtitles: true,
        subtitles: expect.any(Array),
      }),
    );
    expect(result.url).toBe('https://storage.local/final.mp4');
    expect(result.multiScene).toBe(true);
    expect(result.sceneCount).toBe(2);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
    expect(result.musicTrackId).toBe('upbeat-light');
    expect(result.burnedSubtitles).toBe(true);
  });

  it('REEL_MULTI_SCENE=false: un clip con keyframe auto', async () => {
    const config = {
      get: (key: string) => (key === 'REEL_MULTI_SCENE' ? 'false' : undefined),
    };
    const script = { buildReelScript: vi.fn() };
    const composition = {
      concatClips: vi.fn().mockResolvedValue({
        buffer: Buffer.from('mp4'),
        width: 1080,
        height: 1920,
        musicTrackId: 'upbeat-light',
        burnedSubtitles: true,
        durationSeconds: 5,
      }),
      probeClipDuration: vi.fn().mockResolvedValue(5),
    };
    const mediaStorage = {
      save: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/one.mp4',
        storageKey: 'k',
      }),
      readBytesFromUrl: vi.fn().mockResolvedValue({
        buffer: Buffer.from('clip'),
        contentType: 'video/mp4',
      }),
    };
    const image = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://img/auto.png',
        provider: 'openai',
        model: 'gpt-image-2',
        width: 1024,
        height: 1792,
      }),
    };
    const video = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://vid/one.mp4',
        provider: 'fal',
        model: 'fal-ai/minimax/video-01/image-to-video',
        width: 720,
        height: 1280,
      }),
    };

    const service = new ReelPipelineService(
      config as never,
      script as never,
      composition as never,
      mediaStorage as never,
      image as never,
      video as never,
    );

    const result = await service.generate({
      agencyId: 'agency-1',
      brief: 'Solo un clip',
      caption: 'Caption',
    });

    expect(script.buildReelScript).not.toHaveBeenCalled();
    expect(image.generateImage).toHaveBeenCalledTimes(1);
    expect(video.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrl: 'https://img/auto.png' }),
    );
    expect(result.multiScene).toBe(false);
    expect(result.sceneCount).toBe(1);
  });
});
