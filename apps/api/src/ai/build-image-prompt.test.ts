import { describe, expect, it } from 'vitest';
import { buildImagePrompt } from './build-image-prompt';

describe('buildImagePrompt', () => {
  it('incluye brief y caption para anclar el tema', () => {
    const prompt = buildImagePrompt({
      brief: 'Café en taza blanca sobre mesa de madera',
      caption: 'Promo 2x1 en lattes esta semana',
      hashtags: ['#cafe', 'promo'],
    });

    expect(prompt).toContain('Visual brief: Café en taza blanca sobre mesa de madera');
    expect(prompt).toContain('Promo 2x1 en lattes esta semana');
    expect(prompt).toContain('#cafe');
    expect(prompt).toMatch(/social media visual/i);
  });

  it('funciona solo con brief', () => {
    const prompt = buildImagePrompt({ brief: 'Atardecer en playa' });
    expect(prompt).toContain('Atardecer en playa');
    expect(prompt).not.toContain('post caption');
  });
});
