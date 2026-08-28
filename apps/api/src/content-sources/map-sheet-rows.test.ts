import { describe, expect, it } from 'vitest';
import { mapTableToSheetRows } from './map-sheet-rows';
import { isPositiveSentiment, normalizeHeader, parseBool, parseScore } from './radarmex-columns';

describe('radarmex-columns + mapTableToSheetRows', () => {
  it('normaliza headers con guiones y acentos', () => {
    expect(normalizeHeader('score_sentimiento')).toBe('scoresentimiento');
    expect(normalizeHeader('url_radarmex')).toBe('urlradarmex');
    expect(normalizeHeader('Fecha Captura')).toBe('fechacaptura');
  });

  it('parsea bool y score', () => {
    expect(parseBool('TRUE')).toBe(true);
    expect(parseBool('false')).toBe(false);
    expect(parseScore('0,82')).toBe(0.82);
    expect(isPositiveSentiment('Positivo')).toBe(true);
  });

  it('mapea filas estilo Radarmex', () => {
    const table = [
      [
        'external_id',
        'fecha_captura',
        'fuente',
        'url_original',
        'titulo',
        'resumen',
        'categoria',
        'sentimiento',
        'score_sentimiento',
        'razon_sentimiento',
        'publicar',
        'imagen_url',
        'post_facebook',
        'post_instagram',
        'post_x',
        'hashtags',
        'url_radarmex',
      ],
      [
        'noticia_1',
        '28/8/2026',
        'El Universal',
        'https://example.com/orig',
        'Titulo demo',
        'Resumen',
        'Deportes',
        'Positivo',
        '0.91',
        'Buena noticia',
        'TRUE',
        'https://example.com/img.jpg',
        'Copy FB',
        'Copy IG',
        'Copy X',
        '#liga #mx',
        'https://radarmex.example/n1',
      ],
    ];

    const rows = mapTableToSheetRows(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].external_id).toBe('noticia_1');
    expect(rows[0].flagged_publish).toBe(true);
    expect(rows[0].sentiment_score).toBe(0.91);
    expect(rows[0].copy_facebook).toBe('Copy FB');
    expect(rows[0].hashtags).toEqual(['#liga', '#mx']);
    expect(rows[0].article_url).toBe('https://radarmex.example/n1');
  });
});
