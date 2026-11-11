import { describe, expect, it, vi } from 'vitest';
import { AvatarPipelineService } from './avatar-pipeline.service';

describe('AvatarPipelineService', () => {
  it('guion → TTS → lip-sync → composición 9:16 en disco', async () => {
    const clients = {
      findById: vi.fn().mockResolvedValue({
        id: 'client-1',
        brand: { characterImageUrl: 'https://cdn/char.png' },
      }),
    };
    const script = {
      buildAvatarScript: vi.fn().mockResolvedValue({
        spokenText: 'Hola, soy el robot de la marca.',
        subtitleLines: ['Hola', 'Soy el robot'],
        musicSuggestion: 'upbeat light',
      }),
    };
    const composition = {
      concatClips: vi.fn().mockResolvedValue({
        outPath: '/tmp/avatar-out.mp4',
        workDir: '/tmp/avatar-compose',
        width: 1080,
        height: 1920,
        musicTrackId: 'upbeat-light',
        burnedSubtitles: true,
        durationSeconds: 8,
      }),
      downloadClipToFile: vi.fn().mockResolvedValue(undefined),
      probeClipDurationFromPath: vi.fn().mockResolvedValue(8),
      cleanupWorkDir: vi.fn().mockResolvedValue(undefined),
    };
    const mediaStorage = {
      save: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/speech.mp3',
        storageKey: 'a',
      }),
      saveFromFile: vi.fn().mockResolvedValue({
        storageUrl: 'https://storage.local/avatar.mp4',
        storageKey: 'b',
      }),
    };
    const tts = {
      synthesize: vi.fn().mockResolvedValue({
        buffer: Buffer.from('mp3'),
        contentType: 'audio/mpeg',
        extension: 'mp3',
        provider: 'mock',
        model: 'mock-tts',
      }),
    };
    const lipsync = {
      animate: vi.fn().mockResolvedValue({
        url: 'https://storage.local/lipsync.mp4',
        width: 720,
        height: 1280,
        provider: 'mock',
        model: 'mock-lipsync',
      }),
    };

    const service = new AvatarPipelineService(
      clients as never,
      script as never,
      composition as never,
      mediaStorage as never,
      tts as never,
      lipsync as never,
    );

    const result = await service.generate({
      agencyId: 'agency-1',
      clientId: 'client-1',
      brief: 'Promo café',
      caption: 'Prueba nuestro latte',
    });

    expect(tts.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('robot') }),
    );
    expect(lipsync.animate).toHaveBeenCalledWith(
      expect.objectContaining({
        characterImageUrl: 'https://cdn/char.png',
        audioUrl: 'https://storage.local/speech.mp3',
      }),
    );
    expect(composition.concatClips).toHaveBeenCalledWith(
      expect.objectContaining({ keepOnDisk: true, keepClipAudio: true, maxDurationSeconds: 10 }),
    );
    expect(script.buildAvatarScript).toHaveBeenCalledWith(
      expect.objectContaining({ targetSeconds: 10 }),
    );
    expect(mediaStorage.saveFromFile).toHaveBeenCalled();
    expect(result.url).toBe('https://storage.local/avatar.mp4');
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
    expect(result.usedMock).toBe(true);
  });

  it('falla sin personaje', async () => {
    const clients = {
      findById: vi.fn().mockResolvedValue({ id: 'c1', brand: {} }),
    };
    const service = new AvatarPipelineService(
      clients as never,
      { buildAvatarScript: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.generate({
        agencyId: 'a',
        clientId: 'c1',
        brief: 'x',
        caption: 'y',
      }),
    ).rejects.toThrow(/personaje/i);
  });

  function buildPipeline(opts: {
    brand?: Record<string, unknown>;
    composeAvatarTemplate?: ReturnType<typeof vi.fn>;
  }) {
    const clients = {
      findById: vi.fn().mockResolvedValue({
        id: 'client-1',
        brand: { characterImageUrl: 'https://cdn/char.png', ...(opts.brand ?? {}) },
      }),
    };
    const script = {
      buildAvatarScript: vi.fn().mockResolvedValue({
        spokenText: 'Hola, soy el robot de la marca.',
        subtitleLines: ['Hola', 'Soy el robot'],
        musicSuggestion: 'upbeat light',
      }),
    };
    const composition = {
      concatClips: vi.fn().mockResolvedValue({
        outPath: '/tmp/avatar-out.mp4',
        workDir: '/tmp/avatar-compose',
        width: 720,
        height: 1280,
        burnedSubtitles: true,
        durationSeconds: 7,
      }),
      composeAvatarTemplate:
        opts.composeAvatarTemplate ??
        vi.fn().mockResolvedValue({
          outPath: '/tmp/avatar-tpl.mp4',
          workDir: '/tmp/avatar-tpl',
          width: 720,
          height: 1280,
          burnedSubtitles: true,
          durationSeconds: 8.6,
          musicTrackId: 'upbeat-light',
        }),
      downloadClipToFile: vi.fn().mockResolvedValue(undefined),
      probeClipDurationFromPath: vi.fn().mockResolvedValue(7),
      cleanupWorkDir: vi.fn().mockResolvedValue(undefined),
    };
    const mediaStorage = {
      save: vi.fn().mockResolvedValue({ storageUrl: 'https://storage.local/speech.mp3' }),
      saveFromFile: vi
        .fn()
        .mockResolvedValueOnce({ storageUrl: 'https://storage.local/clean.mp4' })
        .mockResolvedValue({ storageUrl: 'https://storage.local/avatar.mp4' }),
      readBytesFromUrl: vi.fn().mockRejectedValue(new Error('sin red en test')),
    };
    const tts = {
      synthesize: vi.fn().mockResolvedValue({
        buffer: Buffer.from('mp3'),
        contentType: 'audio/mpeg',
        extension: 'mp3',
        provider: 'mock',
      }),
    };
    const lipsync = {
      animate: vi.fn().mockResolvedValue({ url: 'https://storage.local/lipsync.mp4', provider: 'mock' }),
    };
    const service = new AvatarPipelineService(
      clients as never,
      script as never,
      composition as never,
      mediaStorage as never,
      tts as never,
      lipsync as never,
    );
    return { service, composition, mediaStorage };
  }

  it('plantilla Profesional por defecto, guarda el clip limpio y no usa la composición clásica', async () => {
    const { service, composition, mediaStorage } = buildPipeline({
      brand: { colors: { dark: '#060A12', primary: '#16263D', accent: '#8FB4D9' }, website: 'ethos.mx' },
    });
    const result = await service.generate({
      agencyId: 'a',
      clientId: 'client-1',
      brief: 'x',
      caption: 'Transforma tu negocio con nuestra consultoría digital. 🚀',
    });
    expect(composition.composeAvatarTemplate).toHaveBeenCalledTimes(1);
    const call = composition.composeAvatarTemplate.mock.calls[0]![0];
    expect(call.mainSeconds).toBe(7);
    expect(call.endCardSeconds).toBe(1.6);
    expect(call.ass).toContain('Transforma tu negocio');
    expect(call.ass).not.toContain('🚀');
    expect(call.layers.card).toEqual({ x: 60, y: 372, w: 600, h: 600 });
    expect(composition.concatClips).not.toHaveBeenCalled();
    expect(result.template).toBe('profesional');
    expect(result.cleanClipUrl).toBe('https://storage.local/clean.mp4');
    expect(result.url).toBe('https://storage.local/avatar.mp4');
    expect(mediaStorage.saveFromFile).toHaveBeenCalledTimes(2);
  });

  it('si la plantilla falla vuelve a la composición clásica (nada se rompe)', async () => {
    const { service, composition } = buildPipeline({
      composeAvatarTemplate: vi.fn().mockRejectedValue(new Error('ffmpeg sin libass')),
    });
    const result = await service.generate({
      agencyId: 'a',
      clientId: 'client-1',
      brief: 'x',
      caption: 'y',
      template: 'circulo',
    });
    expect(composition.composeAvatarTemplate).toHaveBeenCalled();
    expect(composition.concatClips).toHaveBeenCalledWith(
      expect.objectContaining({ keepClipAudio: true, maxDurationSeconds: 10, keepOnDisk: true }),
    );
    expect(result.template).toBe('clasica');
    expect(result.url).toBe('https://storage.local/avatar.mp4');
  });

  it('Clásica no aplica plantilla', async () => {
    const { service, composition } = buildPipeline({});
    const result = await service.generate({
      agencyId: 'a',
      clientId: 'client-1',
      brief: 'x',
      caption: 'y',
      template: 'clasica',
    });
    expect(composition.composeAvatarTemplate).not.toHaveBeenCalled();
    expect(composition.concatClips).toHaveBeenCalled();
    expect(result.template).toBe('clasica');
  });

  it('usa brand.videoTemplate cuando no se pide plantilla', async () => {
    const { service, composition } = buildPipeline({ brand: { videoTemplate: 'dividido' } });
    const result = await service.generate({ agencyId: 'a', clientId: 'client-1', brief: 'x', caption: 'y' });
    expect(composition.composeAvatarTemplate.mock.calls[0]![0].layers.card).toEqual({
      x: 0,
      y: 140,
      w: 720,
      h: 720,
    });
    expect(result.template).toBe('dividido');
  });

  it('si no se puede guardar el clip limpio, el avatar sale igual', async () => {
    const { service, mediaStorage } = buildPipeline({});
    mediaStorage.saveFromFile.mockReset();
    mediaStorage.saveFromFile
      .mockRejectedValueOnce(new Error('R2 caído'))
      .mockResolvedValue({ storageUrl: 'https://storage.local/avatar.mp4' });
    const result = await service.generate({ agencyId: 'a', clientId: 'client-1', brief: 'x', caption: 'y' });
    expect(result.cleanClipUrl).toBeUndefined();
    expect(result.url).toBe('https://storage.local/avatar.mp4');
  });
});
