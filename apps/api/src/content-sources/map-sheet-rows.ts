import {
  AAB_COLUMN_MAP,
  isAabReady,
  stableAabExternalId,
} from './aab-columns';
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

export type SheetProfile = 'radarmex' | 'aab';

/** Cualquier valor distinto de aab (incluido vacío) sigue en RadarMex. */
export function resolveSheetProfile(columnMap: unknown): SheetProfile {
  return columnMap === 'aab' ? 'aab' : 'radarmex';
}

/**
 * Convierte filas tabulares (primera fila = headers) al modelo SheetRow.
 * profile aab no usa la columna vacía como id ni el índice de fila.
 */
export function mapTableToSheetRows(
  table: string[][],
  columnMap: Record<string, string> = RADARMEX_COLUMN_MAP,
  options?: { profile?: SheetProfile },
): SheetRow[] {
  if (table.length < 2) return [];

  const profile: SheetProfile =
    options?.profile ?? (columnMap === AAB_COLUMN_MAP ? 'aab' : 'radarmex');

  const headerCells = table[0].map((h) => normalizeHeader(h));
  const fieldByIndex = headerCells.map((h, idx) => {
    if (columnMap[h]) return columnMap[h];
    // Columna sin nombre al inicio = id de noticia (Radarmex). AAB no.
    if (profile !== 'aab' && !h && idx <= 1) return 'external_id';
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

    if (profile === 'aab') {
      const built = buildAabRow(raw, i + 1);
      if (built) rows.push(built);
      continue;
    }

    const externalId =
      raw.external_id ||
      (raw.title ? `row_${i}_${hashShort(raw.title)}` : '') ||
      `row_${i}`;
    if (!externalId) continue;

    const articleUrl = raw.article_url?.trim() || undefined;
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
      // Solo url_radarmex: nunca url_original de terceros
      article_url: decodeHtmlEntities(articleUrl),
      published_at: raw.published_at || undefined,
    });
  }

  return rows;
}

function buildAabRow(raw: Record<string, string>, sheetRow: number): SheetRow | null {
  const urlOriginal = raw.source_url?.trim() ?? '';
  const title = raw.title?.trim() ?? '';
  const explicit = raw.external_id?.trim() ?? '';
  const fallbackTitle =
    title ||
    [raw.copy_facebook, raw.copy_instagram, raw.copy_threads, raw.copy_x]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join('|');
  const externalId = explicit || stableAabExternalId(urlOriginal, fallbackTitle);
  if (!externalId) return null;

  const blog = decodeHtmlEntities(raw.article_url)?.trim();
  const original = decodeHtmlEntities(urlOriginal)?.trim();
  const link = blog || original || undefined;

  return {
    external_id: externalId,
    captured_at: raw.captured_at || undefined,
    origin: raw.origin || undefined,
    source_url: original || undefined,
    title: title || undefined,
    summary: raw.summary || undefined,
    category: raw.category || undefined,
    image_url: decodeHtmlEntities(raw.image_url) || undefined,
    story_image_url: decodeHtmlEntities(raw.story_image_url) || undefined,
    copy_facebook: raw.copy_facebook || undefined,
    copy_instagram: raw.copy_instagram || undefined,
    copy_threads: raw.copy_threads || undefined,
    copy_x: raw.copy_x || undefined,
    hashtags: parseHashtags(raw.hashtags),
    flagged_publish: isAabReady(raw.estado, raw.estado_redes),
    article_url: link,
    sheet_row: sheetRow,
  };
}

function hashShort(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
