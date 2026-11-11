/**
 * Tope de duración de todos los videos generados (Reel y avatar).
 * Default 15 s: videos cortos con buena intención. VIDEO_MAX_SECONDS solo
 * sirve para bajarlo (mínimo 4 s); nunca sube de 15.
 */
export const VIDEO_MAX_SECONDS_DEFAULT = 15;
/** Seedance genera clips de 2 a 12 s (se cobra por segundo). */
export const SEEDANCE_MIN_CLIP_SECONDS = 2;
export const SEEDANCE_MAX_CLIP_SECONDS = 12;
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
  return Math.min(
    SEEDANCE_MAX_CLIP_SECONDS,
    Math.max(SEEDANCE_MIN_CLIP_SECONDS, Math.floor(total / scenes)),
  );
}

/**
 * Segundos de cada escena para llenar el total (cada clip 2–12 s).
 * 15 s: 1 escena → [12] (Seedance no da más), 2 → [8, 7], 3 → [5, 5, 5].
 * La suma nunca pasa del total.
 */
export function clipSecondsPlan(sceneCount: number, total = videoMaxSeconds()): number[] {
  const scenes = Math.max(1, Math.round(sceneCount) || 1);
  const target = Math.min(total, scenes * SEEDANCE_MAX_CLIP_SECONDS);
  const base = Math.floor(target / scenes);
  let extra = Math.round(target - base * scenes);
  return Array.from({ length: scenes }, () => {
    const add = extra > 0 ? 1 : 0;
    extra -= add;
    return Math.min(
      SEEDANCE_MAX_CLIP_SECONDS,
      Math.max(SEEDANCE_MIN_CLIP_SECONDS, base + add),
    );
  });
}

/** Palabras máximas para que el monólogo quepa en `seconds`. 15 s → 39 palabras. */
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
