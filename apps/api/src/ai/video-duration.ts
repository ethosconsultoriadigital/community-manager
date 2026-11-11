/**
 * Tope de duración de todos los videos generados (Reel y avatar).
 * Default 10 s: videos cortos con buena intención. VIDEO_MAX_SECONDS solo
 * sirve para bajarlo (mínimo 4 s); nunca sube de 10.
 */
export const VIDEO_MAX_SECONDS_DEFAULT = 10;
const VIDEO_MIN_SECONDS = 4;

/** Ritmo de habla en español para TTS (~2.6 palabras/segundo). */
export const SPANISH_WORDS_PER_SECOND = 2.6;

export function videoMaxSeconds(raw: string | undefined = process.env.VIDEO_MAX_SECONDS): number {
  const n = Number(raw?.trim());
  if (!raw?.trim() || !Number.isFinite(n) || n <= 0) return VIDEO_MAX_SECONDS_DEFAULT;
  return Math.min(VIDEO_MAX_SECONDS_DEFAULT, Math.max(VIDEO_MIN_SECONDS, Math.round(n)));
}

/** Duración pedida por el usuario/API, nunca por encima del tope. */
export function capVideoSeconds(requested: number | undefined, max = videoMaxSeconds()): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return max;
  return Math.min(max, Math.max(VIDEO_MIN_SECONDS, Math.round(n)));
}

/** Máximo de escenas que caben en el tope (cada escena ≥5 s). */
export function maxScenesForDuration(max = videoMaxSeconds()): number {
  return Math.max(1, Math.floor(max / 5));
}

/** Segundos por clip para repartir el total entre las escenas (2–12, límites de Seedance). */
export function clipSecondsForScenes(sceneCount: number, total = videoMaxSeconds()): number {
  const scenes = Math.max(1, Math.round(sceneCount) || 1);
  return Math.min(12, Math.max(2, Math.floor(total / scenes)));
}

/** Palabras máximas para que el monólogo quepa en `seconds`. 10 s → 26 palabras. */
export function maxSpokenWords(seconds = videoMaxSeconds()): number {
  return Math.max(8, Math.floor(seconds * SPANISH_WORDS_PER_SECOND));
}

/**
 * Recorta el texto a `maxWords`. Si hay un final de frase en la segunda mitad,
 * corta ahí para que no quede a medias; si no, cierra con punto.
 */
export function trimSpokenText(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  const cut = words.slice(0, maxWords);
  let end = -1;
  for (let i = cut.length - 1; i >= Math.floor(maxWords / 2); i--) {
    if (/[.!?…]["»”)]?$/.test(cut[i])) {
      end = i;
      break;
    }
  }
  if (end >= 0) return cut.slice(0, end + 1).join(' ');
  const joined = cut.join(' ').replace(/[,;:\-–—]+$/, '');
  return /[.!?…]$/.test(joined) ? joined : `${joined}.`;
}
