import { describe, expect, it, vi } from 'vitest';
import { HybridTtsProvider } from './hybrid-tts.provider';

describe('HybridTtsProvider', () => {
  it('sin TTS_PROVIDER sigue en ElevenLabs', async () => {
    const eleven = { synthesize: vi.fn().mockResolvedValue({ provider: 'elevenlabs' }) };
    const fal = { synthesize: vi.fn() };
    const hybrid = new HybridTtsProvider(
      { get: (key: string) => (key === 'ELEVENLABS_API_KEY' ? 'xi-key' : undefined) } as never,
      eleven as never,
      fal as never,
      { synthesize: vi.fn() } as never,
    );
    await hybrid.synthesize({ text: 'Hola' });
    expect(eleven.synthesize).toHaveBeenCalled();
    expect(fal.synthesize).not.toHaveBeenCalled();
  });

  it('TTS_PROVIDER=kokoro usa fal aunque haya clave de ElevenLabs', async () => {
    const eleven = { synthesize: vi.fn() };
    const fal = { synthesize: vi.fn().mockResolvedValue({ provider: 'fal' }) };
    const hybrid = new HybridTtsProvider(
      {
        get: (key: string) => {
          if (key === 'TTS_PROVIDER') return 'kokoro';
          if (key === 'ELEVENLABS_API_KEY') return 'xi-key';
          return undefined;
        },
      } as never,
      eleven as never,
      fal as never,
      { synthesize: vi.fn() } as never,
    );
    await hybrid.synthesize({ text: 'Hola' });
    expect(fal.synthesize).toHaveBeenCalled();
    expect(eleven.synthesize).not.toHaveBeenCalled();
  });
});