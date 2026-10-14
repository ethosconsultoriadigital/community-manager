import { describe, expect, it } from 'vitest';
import { buildParrillaHtml } from './parrilla-html.template';

describe('buildParrillaHtml', () => {
  it('incluye portada Ethos, pieza y casillas de decisión', () => {
    const html = buildParrillaHtml({
      clientName: 'Cliente Demo',
      count: 1,
      generatedAtLabel: '14 de octubre de 2026',
      periodLabel: '14 de octubre de 2026',
      logoDataUrl: null,
      posts: [
        {
          index: 1,
          total: 1,
          clientName: 'Cliente Demo',
          caption: 'Hola & <mundo>',
          hashtags: ['#Ethos'],
          destinations: ['Instagram · @demo'],
          formatLabel: 'Imagen',
          statusLabel: 'Pendiente de aprobación',
          placeName: null,
          shortId: 'abcd1234',
          imageDataUrl: null,
          isVideo: false,
          createdLabel: 'Martes 14 de octubre de 2026',
        },
      ],
    });

    expect(html).toContain('PARRILLA DE');
    expect(html).toContain('Cliente Demo');
    expect(html).toContain('Hola &amp; &lt;mundo&gt;');
    expect(html).toContain('#Ethos');
    expect(html).toContain('Aprobar');
    expect(html).toContain('Rechazar / solicitar cambios');
    expect(html).toContain('class="box"');
    expect(html).toContain('Ethos Consultoría Digital');
  });
});
