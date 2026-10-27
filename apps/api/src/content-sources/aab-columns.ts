import { createHash } from 'node:crypto';

/** Header normalizado → campo interno. No incluye post_linkedin. */
export const AAB_COLUMN_MAP: Record<string, string> = {
  externalid: 'external_id',
  id: 'external_id',
  noticiaid: 'external_id',
  titulonoticia: 'title',
  titulo: 'title',
  resumen: 'summary',
  fuente: 'origin',
  categoria: 'category',
  fechacaptura: 'captured_at',
  postfacebook: 'copy_facebook',
  postinstagram: 'copy_instagram',
  postthreads: 'copy_threads',
  postx: 'copy_x',
  hashtags: 'hashtags',
  imagenaaburl: 'image_url',
  urlblog: 'article_url',
  urloriginal: 'source_url',
  estado: 'estado',
  estadoredes: 'estado_redes',
};

export type AabSheetStatus = 'En aprobación' | 'Publicado' | 'Error' | 'Omitido';

export type AabPostView = {
  status: string;
  /** Última aprobación. El rechazo deja el post en draft. */
  approvalStatus?: string | null;
};

export function isAabConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  return (config as { columnMap?: unknown }).columnMap === 'aab';
}

/**
 * Listo para redes y estado_redes vacío o Pendiente.
 * Cualquier otro estado_redes (En aprobación, Publicado, …) no se vuelve a promover.
 */
export function isAabReady(estado: unknown, estadoRedes: unknown): boolean {
  const ready = String(estado ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (ready !== 'listo para redes') return false;
  const networks = String(estadoRedes ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return networks === '' || networks === 'pendiente';
}

/** Id estable si la hoja no trae columna de id. No usa el número de fila. */
export function stableAabExternalId(urlOriginal: string, titulo: string): string {
  const payload = `${urlOriginal.trim()}|${titulo.trim()}`;
  const digest = createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `aab_${digest}`;
}

export function aabPostOutcome(post: AabPostView): 'pending' | 'published' | 'failed' | 'rejected' {
  if (post.status === 'published') return 'published';
  if (post.status === 'failed') return 'failed';
  if (post.status === 'draft' && post.approvalStatus === 'rejected') return 'rejected';
  return 'pending';
}

/**
 * En aprobación mientras quede algún post abierto.
 * Al cerrar todos: Publicado si alguno salió; Omitido si todos se rechazaron;
 * Error si ninguno se publicó y alguno falló.
 */
export function resolveAabSheetStatus(posts: AabPostView[]): AabSheetStatus | null {
  if (posts.length === 0) return null;
  const outcomes = posts.map(aabPostOutcome);
  if (outcomes.some((outcome) => outcome === 'pending')) return 'En aprobación';
  if (outcomes.some((outcome) => outcome === 'published')) return 'Publicado';
  if (outcomes.every((outcome) => outcome === 'rejected')) return 'Omitido';
  if (outcomes.some((outcome) => outcome === 'failed')) return 'Error';
  return 'En aprobación';
}

/** dd/mm/yyyy HH:mm en America/Mexico_City. */
export function formatSheetDateTime(
  date: Date = new Date(),
  timeZone = 'America/Mexico_City',
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour').padStart(2, '0')}:${pick('minute')}`;
}

export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let letters = '';
  while (n > 0) {
    n -= 1;
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26);
  }
  return letters;
}

export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export function parseDriveFileId(url: string): string | null {
  const trimmed = url.trim();
  const fromPath = trimmed.match(/\/file\/d\/([-a-zA-Z0-9_]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = trimmed.match(/[?&]id=([-a-zA-Z0-9_]+)/);
  if (fromQuery) return fromQuery[1];
  return null;
}

export function isGoogleDriveFileUrl(url: string): boolean {
  return /(?:drive|docs)\.google\.com/i.test(url) && Boolean(parseDriveFileId(url));
}
