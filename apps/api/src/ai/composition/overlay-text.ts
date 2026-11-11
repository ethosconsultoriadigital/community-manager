/**
 * Texto que va encima de la foto compuesta (título). Solo afecta al texto:
 * el logo se pega aparte, sin tocar sus píxeles.
 */

/** Largo máximo del título que se saca del caption. */
export const HEADLINE_MAX_CHARS = 70;

const EMOJI_LIKE =
  /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0e|\ufe0f|\u20e3/gu;
/** Letras, números, puntuación, espacios y moneda: lo que Arial/Helvetica dibuja. */
const RENDERABLE = /[\p{L}\p{M}\p{N}\p{P}\p{Zs}\p{Sc}+=<>|~^`°]/u;

/**
 * Quita emojis, banderas, símbolos que salen como cuadritos, enlaces, hashtags
 * y menciones. Deja texto plano en una línea.
 */
export function sanitizeOverlayText(text: string | null | undefined): string {
  if (!text) return '';
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/(^|\s)[#@][\p{L}\p{N}_]+/gu, ' ')
    .replace(EMOJI_LIKE, ' ');
  let out = '';
  for (const ch of cleaned) {
    out += RENDERABLE.test(ch) ? ch : ' ';
  }
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([¡¿])\s+/g, '$1')
    .trim();
}

/**
 * Corta en palabra completa, sin pasar de maxChars, y agrega "…" si cortó.
 */
export function cutOnWord(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const room = Math.max(1, maxChars - 1);
  const slice = clean.slice(0, room + 1);
  const lastSpace = slice.lastIndexOf(' ');
  let cut = lastSpace > room * 0.4 ? slice.slice(0, lastSpace) : clean.slice(0, room);
  cut = cut.replace(/[\s,;:.\-–—]+$/u, '');
  return `${cut}…`;
}

/**
 * Título corto a partir del caption: la primera frase completa si cabe;
 * si no, se corta en una palabra completa. Sin emojis ni hashtags.
 */
export function headlineFromCaption(
  caption: string | null | undefined,
  maxChars = HEADLINE_MAX_CHARS,
): string {
  const clean = sanitizeOverlayText(caption);
  if (!clean) return '';
  const sentence = firstSentence(clean);
  const base = sentence.length >= 12 ? sentence : clean;
  const trimmed = base.replace(/\.$/, '').trim();
  return cutOnWord(trimmed, maxChars);
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?…])(\s|$)/u.exec(text);
  return (match ? match[1]! : text).trim();
}

/** Aproxima wrapping por ancho de glifo (~0.55em). */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const avgChar = Math.max(fontSize * 0.55, 1);
  const maxChars = Math.max(1, Math.floor(maxWidth / avgChar));
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Ajusta el texto a maxLines: primero baja la letra (hasta minSize) y, si aún
 * no cabe, corta la última línea en palabra completa con "…".
 */
export function fitTextLines(
  text: string,
  maxWidth: number,
  size: number,
  maxLines: number,
  minSize = size,
): { lines: string[]; size: number } {
  const step = Math.max(2, Math.round(size * 0.06));
  let current = size;
  let lines = wrapText(text, maxWidth, current);
  while (lines.length > maxLines && current - step >= minSize) {
    current -= step;
    lines = wrapText(text, maxWidth, current);
  }
  if (lines.length <= maxLines) return { lines, size: current };

  const maxChars = Math.max(1, Math.floor(maxWidth / Math.max(current * 0.55, 1)));
  const kept = lines.slice(0, maxLines);
  const rest = lines.slice(maxLines - 1).join(' ');
  let last = cutOnWord(rest, maxChars);
  if (!last.endsWith('…')) last = `${last}…`;
  kept[maxLines - 1] = last;
  return { lines: kept, size: current };
}

/** Ancho aproximado de una línea en píxeles. */
export function estimateLineWidth(line: string, fontSize: number): number {
  return Math.ceil(line.length * fontSize * 0.55);
}

/** true si el color es claro (texto blanco/claro → banda oscura). */
export function isLightColor(color: string): boolean {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return true;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b >= 140;
}
