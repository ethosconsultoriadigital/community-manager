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
