import { describe, expect, it, vi } from 'vitest';
import { AvatarPipelineService } from './avatar-pipeline.service';

describe('AvatarPipelineService', () => {
  it('guion → TTS → lip-sync → composición 9:16', async () => {
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
        buffer: Buffer.from('mp4'),
        width: 1080,
        height: 1920,
        musicTrackId: 'upbeat-light',
        burnedSubtitles: true,
        durationSeconds: 8,
      }),
      probeClipDuration: vi.fn().mockResolvedValue(8),
      downloadClip: vi.fn(),
    };
    const mediaStorage = {
      save: vi
        .fn()
        .mockResolvedValueOnce({
          storageUrl: 'https://storage.local/speech.mp3',
          storageKey: 'a',
        })
        .mockResolvedValueOnce({
          storageUrl: 'https://storage.local/avatar.mp4',
          storageKey: 'b',
        }),
      readBytesFromUrl: vi.fn().mockResolvedValue({
        buffer: Buffer.from('clip'),
        contentType: 'video/mp4',
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
    expect(composition.concatClips).toHaveBeenCalled();
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
});
