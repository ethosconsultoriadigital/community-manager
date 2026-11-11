import { afterEach, describe, expect, it } from 'vitest';
import {
  capVideoSeconds,
  clipSecondsForScenes,
  maxScenesForDuration,
  maxSpokenWords,
  trimSpokenText,
  videoMaxSeconds,
} from './video-duration';

describe('video-duration (tope de 10 s)', () => {
  const prev = process.env.VIDEO_MAX_SECONDS;
  afterEach(() => {
    if (prev === undefined) delete process.env.VIDEO_MAX_SECONDS;
    else process.env.VIDEO_MAX_SECONDS = prev;
  });

  it('default 10 s; VIDEO_MAX_SECONDS solo lo baja (4–10)', () => {
    expect(videoMaxSeconds(undefined)).toBe(10);
    expect(videoMaxSeconds('')).toBe(10);
    expect(videoMaxSeconds('abc')).toBe(10);
    expect(videoMaxSeconds('30')).toBe(10);
    expect(videoMaxSeconds('8')).toBe(8);
    expect(videoMaxSeconds('2')).toBe(4);
  });

  it('una duración pedida de 15/20/30 s se queda en 10', () => {
    delete process.env.VIDEO_MAX_SECONDS;
    expect(capVideoSeconds(20)).toBe(10);
    expect(capVideoSeconds(30)).toBe(10);
    expect(capVideoSeconds(undefined)).toBe(10);
    expect(capVideoSeconds(6)).toBe(6);
  });

  it('reparte el total entre escenas: 1×10 s o 2×5 s', () => {
    expect(clipSecondsForScenes(1, 10)).toBe(10);
    expect(clipSecondsForScenes(2, 10)).toBe(5);
    expect(clipSecondsForScenes(3, 10)).toBe(3);
    expect(maxScenesForDuration(10)).toBe(2);
    expect(maxScenesForDuration(8)).toBe(1);
  });

  it('10 s de voz ≈ 26 palabras en español', () => {
    expect(maxSpokenWords(10)).toBe(26);
  });

  it('recorta el monólogo en un final de frase si puede', () => {
    const long =
      'Hola, soy Robi de la marca. Hoy te traigo la mejor promoción del mes para tu negocio. ' +
      'Aprovecha el descuento en todos los servicios de diseño, redes sociales y páginas web antes del viernes porque se acaba pronto.';
    const out = trimSpokenText(long, 26);
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(26);
    expect(out.endsWith('negocio.')).toBe(true);
  });

  it('sin final de frase cercano cierra con punto', () => {
    const words = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ');
    const out = trimSpokenText(words, 26);
    expect(out.split(/\s+/)).toHaveLength(26);
    expect(out.endsWith('.')).toBe(true);
  });

  it('no toca un texto que ya cabe', () => {
    expect(trimSpokenText('Hola, visítanos hoy.', 26)).toBe('Hola, visítanos hoy.');
  });
});
