import { describe, expect, it } from 'vitest';
import { AAB_COLUMN_MAP } from './aab-columns';
import { planAabCellUpdates } from './aab-sheet-plan';
import { mapTableToSheetRows } from './map-sheet-rows';
import {
  isPositiveSentiment,
  normalizeHeader,
  parseBool,
  parseScore,
  parseSheetDate,
} from './radarmex-columns';

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

  it('parsea fecha estilo Radarmex sin Invalid Date', () => {
    const d = parseSheetDate('28/8/2026 0:23:34');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(28);
    expect(parseSheetDate('no-es-fecha')).toBeNull();
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
        'https://example.com/img.jpg?a=1&amp;b=2',
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
    expect(rows[0].image_url).toContain('&b=2');
    expect(rows[0].image_url).not.toContain('&amp;');
  });

  const aabHeaders = [
    'noticia_id',
    'titulo',
    'resumen',
    'fuente',
    'categoria',
    'fecha_captura',
    'post_facebook',
    'post_instagram',
    'post_threads',
    'post_x',
    'post_linkedin',
    'hashtags',
    'imagen_aab_url',
    'url_blog',
    'url_original',
    'nivel',
    'estado',
    'estado_redes',
    'fecha_redes',
  ];

  function aabRow(overrides: string[]): string[] {
    const base = [
      'n-1',
      'Titulo AAB',
      'Resumen',
      'Blog',
      'Tech',
      '27/10/2026',
      'Copy FB',
      'Copy IG',
      'Copy Threads',
      'Copy X',
      'No LinkedIn',
      '#aab',
      'https://drive.google.com/file/d/FILE123/view',
      'https://blog.example/nota',
      'https://origen.example/nota',
      'Blog + redes',
      'Listo para redes',
      '',
      '',
    ];
    overrides.forEach((value, index) => {
      if (value !== undefined) base[index] = value;
    });
    return base;
  }

  it('mapea AAB: listo, enlace del blog, threads propio y sin LinkedIn', () => {
    const rows = mapTableToSheetRows([aabHeaders, aabRow([])], AAB_COLUMN_MAP, {
      profile: 'aab',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].external_id).toBe('n-1');
    expect(rows[0].flagged_publish).toBe(true);
    expect(rows[0].article_url).toBe('https://blog.example/nota');
    expect(rows[0].copy_threads).toBe('Copy Threads');
    expect(rows[0].copy_x).toBe('Copy X');
    expect(rows[0].copy_facebook).not.toContain('LinkedIn');
    expect(JSON.stringify(rows[0])).not.toContain('No LinkedIn');
    expect(rows[0].sheet_row).toBe(2);
  });

  it('AAB usa url_original si no hay url_blog y acepta Pendiente', () => {
    const row = aabRow([]);
    row[0] = 'n-2';
    row[13] = '';
    row[17] = 'Pendiente';
    const rows = mapTableToSheetRows([aabHeaders, row], AAB_COLUMN_MAP, { profile: 'aab' });
    expect(rows[0].flagged_publish).toBe(true);
    expect(rows[0].article_url).toBe('https://origen.example/nota');
  });

  it('AAB no promueve si estado no está listo o estado_redes ya avanzó', () => {
    const draft = aabRow([]);
    draft[16] = 'Borrador';
    const busy = aabRow([]);
    busy[0] = 'n-3';
    busy[17] = 'En aprobación';
    const soloRedes = aabRow([]);
    soloRedes[0] = 'n-4';
    soloRedes[15] = 'Solo redes';
    const rows = mapTableToSheetRows(
      [aabHeaders, draft, busy, soloRedes],
      AAB_COLUMN_MAP,
      { profile: 'aab' },
    );
    expect(rows.map((row) => [row.external_id, row.flagged_publish])).toEqual([
      ['n-1', false],
      ['n-3', false],
      ['n-4', true],
    ]);
  });

  it('sin columna id el external_id es un hash estable aunque se borre una fila de arriba', () => {
    const headers = aabHeaders.map((header) => (header === 'noticia_id' ? 'nota' : header));
    const first = aabRow([]);
    first[0] = '';
    first[1] = 'Primera';
    first[14] = 'https://origen.example/primera';
    const second = aabRow([]);
    second[0] = '';
    second[1] = 'Segunda';
    second[14] = 'https://origen.example/segunda';

    const full = mapTableToSheetRows([headers, first, second], AAB_COLUMN_MAP, { profile: 'aab' });
    const shifted = mapTableToSheetRows([headers, second], AAB_COLUMN_MAP, { profile: 'aab' });

    expect(full[1].external_id.startsWith('aab_')).toBe(true);
    expect(full[1].external_id).not.toContain('row_');
    expect(shifted[0].external_id).toBe(full[1].external_id);
    expect(shifted[0].sheet_row).toBe(2);
    expect(full[1].sheet_row).toBe(3);
  });

  it('escribe estado_redes y fecha_redes en la fila reencontrada, no en un índice viejo', () => {
    const headers = ['titulo', 'url_original', 'estado', 'estado_redes', 'fecha_redes'];
    const kept = ['Segunda', 'https://origen.example/segunda', 'Listo para redes', '', ''];
    const shifted = mapTableToSheetRows(
      [headers, ['Primera', 'https://origen.example/primera', 'Listo para redes', '', ''], kept],
      AAB_COLUMN_MAP,
      { profile: 'aab' },
    );
    const id = shifted[1].external_id;
    const updates = planAabCellUpdates(
      [headers, kept],
      id,
      'En aprobación',
      '27/10/2026 00:10',
      'Noticias',
    );
    expect(updates).toEqual([
      { range: "'Noticias'!D2", values: [['En aprobación']] },
      { range: "'Noticias'!E2", values: [['27/10/2026 00:10']] },
    ]);
  });
});
