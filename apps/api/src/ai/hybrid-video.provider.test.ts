import { describe, expect, it, vi } from 'vitest';
import { HybridVideoProvider } from './hybrid-video.provider';

describe('HybridVideoProvider', () => {
  it('usa fal cuando hay FAL_KEY', async () => {
    const config = {
      get: (key: string) => (key === 'FAL_KEY' ? 'fal-test' : undefined),
    };
    const fal = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://storage.local/v.mp4',
        width: 720,
        height: 1280,
        model: 'fal-ai/minimax/video-01',
        provider: 'fal',
      }),
    };
    const mock = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://mock/v.mp4',
        width: 720,
        height: 1280,
        provider: 'mock',
      }),
    };

    const hybrid = new HybridVideoProvider(config as never, fal as never, mock as never);
    const result = await hybrid.generateVideo({
      prompt: 'hola',
      agencyId: 'a1',
    });

    expect(fal.generateVideo).toHaveBeenCalled();
    expect(mock.generateVideo).not.toHaveBeenCalled();
    expect(result.provider).toBe('fal');
  });

  it('usa mock sin FAL_KEY', async () => {
    const config = { get: () => undefined };
    const fal = { generateVideo: vi.fn() };
    const mock = {
      generateVideo: vi.fn().mockResolvedValue({
        url: 'https://mock/v.mp4',
        width: 720,
        height: 1280,
        provider: 'mock',
      }),
    };

    const hybrid = new HybridVideoProvider(config as never, fal as never, mock as never);
    const result = await hybrid.generateVideo({ prompt: 'hola', agencyId: 'a1' });

    expect(mock.generateVideo).toHaveBeenCalled();
    expect(fal.generateVideo).not.toHaveBeenCalled();
    expect(result.provider).toBe('mock');
  });

  it('en producción no cae a mock si falta FAL_KEY', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const hybrid = new HybridVideoProvider(
        { get: () => undefined } as never,
        { generateVideo: vi.fn() } as never,
        { generateVideo: vi.fn() } as never,
      );
      await expect(hybrid.generateVideo({ prompt: 'hola', agencyId: 'a1' })).rejects.toThrow(
        /FAL_KEY/,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
