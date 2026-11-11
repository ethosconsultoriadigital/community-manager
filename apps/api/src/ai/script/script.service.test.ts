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

  it('clampa sceneCount entre 1 y 4 (1 escena cabe en 512 MB)', () => {
    const service = new ScriptService({ get: () => undefined } as never, {} as never);
    expect(service.resolveSceneCount(1)).toBe(1);
    expect(service.resolveSceneCount(9)).toBe(4);
  });
});

describe('ScriptService avatar (máx. 15 s)', () => {
  it('pide ≤15 s al LLM aunque lleguen 30 y recorta el monólogo a ~39 palabras', async () => {
    const longText = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ');
    const llm = {
      generateAvatarScript: vi.fn().mockResolvedValue({
        spokenText: longText,
        subtitleLines: ['línea larga 1', 'línea larga 2'],
        musicSuggestion: 'acoustic',
      }),
    };
    const service = new ScriptService({ get: () => undefined } as never, llm as never);
    const out = await service.buildAvatarScript({ brief: 'Promo', targetSeconds: 30 });
    expect(llm.generateAvatarScript).toHaveBeenCalledWith(
      expect.objectContaining({ targetSeconds: 15 }),
    );
    expect(out.spokenText.split(/\s+/).length).toBeLessThanOrEqual(39);
    // Subtítulos rehechos con el texto recortado (no los del texto largo).
    expect(out.subtitleLines.join(' ')).not.toContain('línea larga');
    expect(out.subtitleLines.length).toBeLessThanOrEqual(5);
  });

  it('respeta un monólogo corto y sus subtítulos', async () => {
    const llm = {
      generateAvatarScript: vi.fn().mockResolvedValue({
        spokenText: 'Hola, soy Robi. Visítanos hoy.',
        subtitleLines: ['Hola, soy Robi.', 'Visítanos hoy.'],
      }),
    };
    const service = new ScriptService({ get: () => undefined } as never, llm as never);
    const out = await service.buildAvatarScript({ brief: 'Promo' });
    expect(out.spokenText).toBe('Hola, soy Robi. Visítanos hoy.');
    expect(out.subtitleLines).toEqual(['Hola, soy Robi.', 'Visítanos hoy.']);
  });
});
