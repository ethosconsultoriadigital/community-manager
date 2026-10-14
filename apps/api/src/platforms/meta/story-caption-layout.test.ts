import { describe, expect, it } from 'vitest';
import { buildStoryCaptionSvg, wrapStoryCaption } from './story-caption-layout';

describe('story-caption-layout', () => {
  it('parte caption largo en varias líneas', () => {
    const lines = wrapStoryCaption(
      'Promo especial de lattes artesanales este fin de semana en todas nuestras sucursales de Guadalajara',
      4,
      30,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it('genera SVG con texto escapado y sin franja de fondo', () => {
    const svg = buildStoryCaptionSvg(['Hola & <world>'], 1080, 400);
    expect(svg).toContain('Hola &amp; &lt;world&gt;');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('paint-order="stroke fill"');
  });
});
