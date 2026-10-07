import { describe, expect, it, vi } from 'vitest';
import { ScriptService } from './script.service';

describe('ScriptService', () => {
  it('pide al LLM el número de escenas y normaliza el resultado', async () => {
    const llm = {
      generateReelScript: vi.fn().mockResolvedValue({
        scenes: [
          {
            id: '1',
            visualPrompt: 'Latte close-up',
            motionPrompt: 'Slow push in',
            subtitle: 'Café',
            durationHintSeconds: 5,
          },
          {
            id: '2',
            visualPrompt: 'Barista pour',
            motionPrompt: 'Pan right',
            subtitle: '',
            durationHintSeconds: 6,
          },
        ],
        musicSuggestion: 'acoustic',
      }),
    };
    const config = { get: () => undefined };
    const service = new ScriptService(config as never, llm as never);

    const script = await service.buildReelScript({
      brief: 'Café de especialidad',
      caption: 'Prueba nuestro latte',
      sceneCount: 2,
    });

    expect(llm.generateReelScript).toHaveBeenCalledWith(
      expect.objectContaining({ brief: 'Café de especialidad', sceneCount: 2 }),
    );
    expect(script.scenes).toHaveLength(2);
    expect(script.musicSuggestion).toBe('acoustic');
  });

  it('clampa sceneCount entre 2 y 4', () => {
    const service = new ScriptService({ get: () => undefined } as never, {} as never);
    expect(service.resolveSceneCount(1)).toBe(2);
    expect(service.resolveSceneCount(9)).toBe(4);
  });
});
