import { describe, expect, it, vi } from 'vitest';
import { HybridImageProvider } from './hybrid-image.provider';

describe('HybridImageProvider', () => {
  it('usa OpenAI cuando hay IMAGE_API_KEY', async () => {
    const config = {
      get: (key: string) => (key === 'IMAGE_API_KEY' ? 'sk-test' : undefined),
    };
    const openAi = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://storage.local/openai.png',
        width: 1024,
        height: 1024,
        provider: 'openai',
        model: 'gpt-image-2',
      }),
    };
    const mock = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://picsum.photos/seed/x/1080/1080',
        width: 1080,
        height: 1080,
      }),
    };

    const hybrid = new HybridImageProvider(config as never, openAi as never, mock as never);
    const result = await hybrid.generateImage({ brief: 'hola', agencyId: 'a1' });

    expect(openAi.generateImage).toHaveBeenCalled();
    expect(mock.generateImage).not.toHaveBeenCalled();
    expect(result.provider).toBe('openai');
  });

  it('usa mock cuando no hay API key', async () => {
    const config = { get: () => undefined };
    const openAi = { generateImage: vi.fn() };
    const mock = {
      generateImage: vi.fn().mockResolvedValue({
        url: 'https://picsum.photos/seed/x/1080/1080',
        width: 1080,
        height: 1080,
      }),
    };

    const hybrid = new HybridImageProvider(config as never, openAi as never, mock as never);
    const result = await hybrid.generateImage({ brief: 'hola', agencyId: 'a1' });

    expect(mock.generateImage).toHaveBeenCalled();
    expect(openAi.generateImage).not.toHaveBeenCalled();
    expect(result.provider).toBe('mock');
  });
});
