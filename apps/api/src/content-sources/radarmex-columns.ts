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

  // ISO date-only primero (evita que 2026-08-28 se malinterprete o cambie de día por UTC)
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDay) {
    const year = Number(isoDay[1]);
    const month = Number(isoDay[2]);
    const day = Number(isoDay[3]);
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

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

/** Fecha YYYY-MM-DD en zona (default CDMX). */
export function calendarDateInTz(
  date: Date = new Date(),
  timeZone = 'America/Mexico_City',
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Extrae YYYY-MM-DD de un Date o string de Sheet. */
export function toCalendarDate(
  value: Date | string | null | undefined,
  timeZone = 'America/Mexico_City',
): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const isoDay = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return calendarDateInTz(value, timeZone);
  }
  const parsed = parseSheetDate(value);
  if (!parsed) return null;
  // Fechas parseadas desde dd/mm/yyyy ya están en hora local del servidor
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateInRange(
  dateKey: string | null,
  fromKey: string,
  toKey: string,
): boolean {
  if (!dateKey) return false;
  return dateKey >= fromKey && dateKey <= toKey;
}

/** Heurística: URL de la web propia Radarmex (no medios externos). */
export function looksLikeRadarmexUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return u.includes('radarmex') || u.includes('radar.mex') || u.includes('radar-mex');
}
