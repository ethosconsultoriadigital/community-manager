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
    expect(image.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageSize: '720x1280' }),
    );
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

  describe('tope de 15 s', () => {
    function build(configValues: Record<string, string> = {}) {
      const config = {
        get: (key: string) => ({ REEL_MULTI_SCENE: 'true', ...configValues })[key],
      };
      const script = {
        buildReelScript: vi.fn(async ({ sceneCount }: { sceneCount: number }) => ({
          scenes: Array.from({ length: sceneCount }, (_, i) => ({
            id: String(i + 1),
            visualPrompt: `v${i}`,
            motionPrompt: `m${i}`,
            subtitle: `s${i}`,
            durationHintSeconds: 5,
          })),
        })),
      };
      const composition = {
        concatClips: vi.fn().mockResolvedValue({
          outPath: '/tmp/out.mp4',
          workDir: '/tmp/compose',
          width: 720,
          height: 1280,
          burnedSubtitles: true,
          durationSeconds: 10,
        }),
        downloadClipToFile: vi.fn().mockResolvedValue(undefined),
        probeClipDurationFromPath: vi.fn().mockResolvedValue(10),
        cleanupWorkDir: vi.fn().mockResolvedValue(undefined),
      };
      const mediaStorage = {
        saveFromFile: vi.fn().mockResolvedValue({ storageUrl: 'https://s/f.mp4', storageKey: 'k' }),
      };
      const image = {
        generateImage: vi.fn().mockResolvedValue({ url: 'https://img/k.png', provider: 'openai' }),
      };
      const video = {
        generateVideo: vi.fn().mockResolvedValue({ url: 'https://v/c.mp4', provider: 'fal', model: 'seedance' }),
      };
      const service = new ReelPipelineService(
        config as never,
        script as never,
        composition as never,
        mediaStorage as never,
        image as never,
        video as never,
      );
      return { service, script, composition, image, video };
    }

    it('por defecto: 2 escenas (8 + 7 s) llenan el tope de 15 s', async () => {
      const { service, image, video, composition } = build();
      const result = await service.generate({ agencyId: 'a', brief: 'b', caption: 'c' });
      expect(result.sceneCount).toBe(2);
      expect(image.generateImage).toHaveBeenCalledTimes(2);
      expect(video.generateVideo.mock.calls.map((c) => c[0].durationSeconds)).toEqual([8, 7]);
      expect(composition.concatClips).toHaveBeenCalledWith(
        expect.objectContaining({ maxDurationSeconds: 15 }),
      );
    });

    it('REEL_SCENE_COUNT=1 de Render: 1 escena de 12 s (máx. de Seedance, lo más barato)', async () => {
      const { service, image, video, composition } = build({ REEL_SCENE_COUNT: '1' });
      const result = await service.generate({ agencyId: 'a', brief: 'b', caption: 'c' });
      expect(result.sceneCount).toBe(1);
      expect(image.generateImage).toHaveBeenCalledTimes(1);
      expect(video.generateVideo).toHaveBeenCalledTimes(1);
      expect(video.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ durationSeconds: 12 }),
      );
      expect(composition.concatClips).toHaveBeenCalledWith(
        expect.objectContaining({ maxDurationSeconds: 15 }),
      );
    });

    it('el sceneCount del Composer gana a REEL_SCENE_COUNT', () => {
      const { service } = build({ REEL_SCENE_COUNT: '1' });
      expect(
        service.resolveSceneCount({ agencyId: 'a', brief: 'b', caption: 'c', sceneCount: 2 }),
      ).toBe(2);
    });

    it('pedir 20 s o 4 escenas no pasa de 15 s (3 × 5 s)', async () => {
      const { service, video, composition } = build({ REEL_MAX_SCENES: '4' });
      const result = await service.generate({
        agencyId: 'a',
        brief: 'b',
        caption: 'c',
        sceneCount: 4,
        targetDurationSeconds: 20,
      });
      expect(result.sceneCount).toBe(3);
      expect(video.generateVideo.mock.calls.map((c) => c[0].durationSeconds)).toEqual([5, 5, 5]);
      expect(composition.concatClips).toHaveBeenCalledWith(
        expect.objectContaining({ maxDurationSeconds: 15 }),
      );
    });

    it('REEL_SCENE_COUNT=2 de Render se respeta como default', async () => {
      const { service } = build({ REEL_SCENE_COUNT: '2' });
      expect(service.resolveSceneCount({ agencyId: 'a', brief: 'b', caption: 'c' })).toBe(2);
    });

    it('con VIDEO_MAX_SECONDS=10 el default vuelve a 1 escena de 10 s', async () => {
      const prev = process.env.VIDEO_MAX_SECONDS;
      process.env.VIDEO_MAX_SECONDS = '10';
      try {
        const { service, video } = build();
        const result = await service.generate({ agencyId: 'a', brief: 'b', caption: 'c' });
        expect(result.sceneCount).toBe(1);
        expect(video.generateVideo).toHaveBeenCalledWith(
          expect.objectContaining({ durationSeconds: 10 }),
        );
      } finally {
        if (prev === undefined) delete process.env.VIDEO_MAX_SECONDS;
        else process.env.VIDEO_MAX_SECONDS = prev;
      }
    });

    it('modo single clip pide 15 s (Seedance lo deja en 12) y recorta a 15 s', async () => {
      const { service, video, composition } = build({ REEL_MULTI_SCENE: 'false' });
      await service.generate({ agencyId: 'a', brief: 'b', caption: 'c', targetDurationSeconds: 20 });
      expect(video.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ durationSeconds: 15 }),
      );
      expect(composition.concatClips).toHaveBeenCalledWith(
        expect.objectContaining({ maxDurationSeconds: 15 }),
      );
    });

    it('subtítulos no pasan del tope', () => {
      const { service } = build();
      const cues = service.buildSubtitleCues(['a', 'b', 'c'], [6, 6, 6], 'cap', true, 10);
      expect(cues).toHaveLength(2);
      expect(Math.max(...cues.map((c) => c.endSeconds))).toBeLessThanOrEqual(10);
    });
  });
});
