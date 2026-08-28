import type { SheetRow } from './interfaces/sheet-ingest-provider.interface';
import {
  normalizeHeader,
  parseBool,
  parseHashtags,
  parseScore,
  RADARMEX_COLUMN_MAP,
  decodeHtmlEntities,
} from './radarmex-columns';

export type ParsedSheetTable = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Convierte filas tabulares (primera fila = headers) al modelo SheetRow.
 */
export function mapTableToSheetRows(
  table: string[][],
  columnMap: Record<string, string> = RADARMEX_COLUMN_MAP,
): SheetRow[] {
  if (table.length < 2) return [];

  const headerCells = table[0].map((h) => normalizeHeader(h));
  const fieldByIndex = headerCells.map((h, idx) => {
    if (columnMap[h]) return columnMap[h];
    // Columna sin nombre al inicio = id de noticia (Radarmex)
    if (!h && idx <= 1) return 'external_id';
    return null;
  });

  const rows: SheetRow[] = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const raw: Record<string, string> = {};
    for (let c = 0; c < fieldByIndex.length; c += 1) {
      const field = fieldByIndex[c];
      if (!field) continue;
      raw[field] = String(cells[c] ?? '').trim();
    }

    const externalId =
      raw.external_id ||
      (raw.title ? `row_${i}_${hashShort(raw.title)}` : '') ||
      `row_${i}`;
    if (!externalId) continue;

    const articleUrl = raw.article_url || raw.source_url || undefined;
    const score = parseScore(raw.sentiment_score);

    rows.push({
      external_id: externalId,
      captured_at: raw.captured_at || undefined,
      origin: raw.origin || undefined,
      source_url: raw.source_url || undefined,
      title: raw.title || undefined,
      summary: raw.summary || undefined,
      category: raw.category || undefined,
      sentiment: raw.sentiment || undefined,
      sentiment_score: score,
      sentiment_reason: raw.sentiment_reason || undefined,
      image_url: decodeHtmlEntities(raw.image_url) || undefined,
      copy_facebook: raw.copy_facebook || undefined,
      copy_instagram: raw.copy_instagram || undefined,
      copy_x: raw.copy_x || undefined,
      hashtags: parseHashtags(raw.hashtags),
      flagged_publish: parseBool(raw.flagged_publish),
      article_url: decodeHtmlEntities(articleUrl),
    });
  }

  return rows;
}

function hashShort(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
