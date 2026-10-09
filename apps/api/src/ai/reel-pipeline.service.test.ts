import { describe, expect, it, vi } from 'vitest';
import { ReelPipelineService } from './reel-pipeline.service';

describe('ReelPipelineService', () => {
  it('multi-escena: keyframe por escena + i2v + concat en disco', async () => {
    const config = {
      get: (key: string) => {
        if (key === 'REEL_MULTI_SCENE') return 'true';
        if (key === 'REEL_MAX_SCENES') return '2';
        return undefined;
      },
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
        outPath: '/tmp/out.mp4',
        workDir: '/tmp/compose',
        width: 1080,
        height: 1920,
        musicTrackId: 'upbeat-light',
        burnedSubtitles: true,
        durationSeconds: 10,
      }),
      downloadClipToFile: vi.fn().mockResolvedValue(undefined),
      probeClipDurationFromPath: vi.fn().mockResolvedValue(5),
      cleanupWorkDir: vi.fn().mockResolvedValue(undefined),
    };
    const mediaStorage = {
      saveFromFile: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/final.mp4',
        storageKey: 'k',
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
    expect(image.generateImage).toHaveBeenCalledTimes(1);
    expect(video.generateVideo).toHaveBeenCalledTimes(2);
    expect(composition.downloadClipToFile).toHaveBeenCalledTimes(2);
    expect(composition.concatClips).toHaveBeenCalledWith(
      expect.objectContaining({ keepOnDisk: true, clipPaths: expect.any(Array) }),
    );
    expect(mediaStorage.saveFromFile).toHaveBeenCalled();
    expect(result.url).toBe('https://storage.local/final.mp4');
    expect(result.sceneCount).toBe(2);
    expect(result.multiScene).toBe(true);
  });

  it('modo single clip si REEL_MULTI_SCENE=false', async () => {
    const config = {
      get: (key: string) => (key === 'REEL_MULTI_SCENE' ? 'false' : undefined),
    };
    const composition = {
      concatClips: vi.fn().mockResolvedValue({
        outPath: '/tmp/out.mp4',
        workDir: '/tmp/compose',
        width: 1080,
        height: 1920,
        burnedSubtitles: true,
        durationSeconds: 5,
      }),
      downloadClipToFile: vi.fn().mockResolvedValue(undefined),
      probeClipDurationFromPath: vi.fn().mockResolvedValue(5),
      cleanupWorkDir: vi.fn().mockResolvedValue(undefined),
    };
    const mediaStorage = {
      saveFromFile: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/one.mp4',
        storageKey: 'k',
      }),
    };
    const image = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://img/k.png',
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
        model: 'm',
        width: 720,
        height: 1280,
      }),
    };

    const service = new ReelPipelineService(
      config as never,
      { buildReelScript: vi.fn() } as never,
      composition as never,
      mediaStorage as never,
      image as never,
      video as never,
    );

    const result = await service.generate({
      agencyId: 'agency-1',
      brief: 'Solo una escena',
      caption: 'Caption',
    });

    expect(result.sceneCount).toBe(1);
    expect(result.multiScene).toBe(false);
    expect(video.generateVideo).toHaveBeenCalledTimes(1);
  });
});
