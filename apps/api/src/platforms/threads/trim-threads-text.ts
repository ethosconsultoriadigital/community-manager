export const THREADS_TEXT_LIMIT = 500;
const ELLIPSIS = '…';
const LINK_RE = /https?:\/\/[^\s<>"']+/i;

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

function sliceCodePoints(text: string, count: number): string {
  if (count <= 0) return '';
  return Array.from(text).slice(0, count).join('');
}

function extractLink(text: string): string | null {
  const match = text.match(LINK_RE);
  if (!match) return null;
  return match[0].replace(/[.,);:\]]+$/g, '');
}

function withoutLink(text: string, link: string): string {
  const index = text.indexOf(link);
  if (index < 0) return text.trim();
  return `${text.slice(0, index)} ${text.slice(index + link.length)}`
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Índice (en puntos de código) justo después del último cierre de frase que cabe. */
function lastSentenceBoundary(text: string): number {
  const chars = Array.from(text);
  let boundary = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    const prev = chars[i - 1] ?? '';
    const next = chars[i + 1];
    if (ch === '.' && /\d/.test(prev) && next && /\d/.test(next)) continue;
    if (next === undefined || /\s/.test(next)) boundary = i + 1;
  }
  return boundary;
}

/** Recorta a maxChars por una frase completa, o por la última palabra si no hay frase. */
function fitBody(text: string, maxChars: number): string {
  const clean = text.trim();
  if (maxChars <= 0 || !clean) return '';
  if (codePointLength(clean) <= maxChars) return clean;
  const prefix = sliceCodePoints(clean, maxChars);
  const boundary = lastSentenceBoundary(prefix);
  if (boundary > 0) return Array.from(prefix).slice(0, boundary).join('').trimEnd();
  const chars = Array.from(prefix);
  let space = -1;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (/\s/.test(chars[i])) {
      space = i;
      break;
    }
  }
  if (space > 0) return chars.slice(0, space).join('').trimEnd();
  return prefix.trimEnd();
}

function clamp(text: string, limit: number): string {
  if (codePointLength(text) <= limit) return text;
  return sliceCodePoints(text, limit);
}

/**
 * Threads cuenta puntos de código y rechaza más de 500.
 * Si no cabe, deja la última frase completa, añade … y conserva el enlace.
 */
export function trimThreadsText(text: string, limit = THREADS_TEXT_LIMIT): string {
  const source = text.trim();
  if (!source) return source;
  if (codePointLength(source) <= limit) return source;

  const link = extractLink(source);
  if (!link) {
    const body = fitBody(source, limit - codePointLength(ELLIPSIS));
    return clamp(body ? `${body}${ELLIPSIS}` : ELLIPSIS, limit);
  }

  const bodySource = withoutLink(source, link);
  const intact = bodySource ? `${bodySource}\n\n${link}` : link;
  if (codePointLength(intact) <= limit) return intact;

  if (codePointLength(link) >= limit) return sliceCodePoints(link, limit);

  const tail = `${ELLIPSIS}\n\n${link}`;
  if (codePointLength(tail) > limit) return link;

  const body = fitBody(bodySource, limit - codePointLength(tail));
  if (!body) return tail;
  return clamp(`${body}${tail}`, limit);
}
