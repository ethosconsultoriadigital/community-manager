/** Normaliza nombres de columna (quita acentos, guiones bajos, espacios). */
export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Mapeo canónico Radarmex (header normalizado → campo SheetRow). */
export const RADARMEX_COLUMN_MAP: Record<string, string> = {
  externalid: 'external_id',
  id: 'external_id',
  noticiaid: 'external_id',
  fechacaptura: 'captured_at',
  fuente: 'origin',
  urloriginal: 'source_url',
  titulo: 'title',
  resumen: 'summary',
  categoria: 'category',
  sentimiento: 'sentiment',
  scoresentimiento: 'sentiment_score',
  razonsentimiento: 'sentiment_reason',
  publicar: 'flagged_publish',
  imagenurl: 'image_url',
  postfacebook: 'copy_facebook',
  postinstagram: 'copy_instagram',
  postx: 'copy_x',
  hashtags: 'hashtags',
  urlradarmex: 'article_url',
  fechapublicacion: 'published_at',
  estado: 'estado',
  duplicado: 'duplicado',
};

export function parseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí';
}

export function parseScore(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function parseHashtags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((t) => String(t).trim()).filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

export function isPositiveSentiment(sentiment: string | undefined): boolean {
  if (!sentiment) return false;
  const s = sentiment.trim().toLowerCase();
  return s === 'positivo' || s === 'positive' || s.startsWith('positiv');
}

/**
 * Parsea fechas del Sheet Radarmex (ej. "28/8/2026 0:23:34" o ISO).
 * Si no se puede parsear, devuelve null (nunca Invalid Date).
 */
export function parseSheetDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial de Sheets (días desde 1899-12-30)
    if (value > 20000 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const dmy = raw.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const hour = Number(dmy[4] ?? 0);
    const minute = Number(dmy[5] ?? 0);
    const second = Number(dmy[6] ?? 0);
    const d = new Date(year, month - 1, day, hour, minute, second);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

export function decodeHtmlEntities(url: string | undefined): string | undefined {
  if (!url) return url;
  return url
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
