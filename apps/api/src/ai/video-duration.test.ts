import { afterEach, describe, expect, it } from 'vitest';
import {
  capVideoSeconds,
  clipSecondsForScenes,
  clipSecondsPlan,
  maxScenesForDuration,
  maxSpokenWords,
  trimSpokenText,
  videoMaxSeconds,
} from './video-duration';

describe('video-duration (tope de 15 s)', () => {
  const prev = process.env.VIDEO_MAX_SECONDS;
  afterEach(() => {
    if (prev === undefined) delete process.env.VIDEO_MAX_SECONDS;
    else process.env.VIDEO_MAX_SECONDS = prev;
  });

  it('default 15 s; VIDEO_MAX_SECONDS solo lo baja (4–15)', () => {
    expect(videoMaxSeconds(undefined)).toBe(15);
    expect(videoMaxSeconds('')).toBe(15);
    expect(videoMaxSeconds('abc')).toBe(15);
    expect(videoMaxSeconds('30')).toBe(15);
    expect(videoMaxSeconds('10')).toBe(10);
    expect(videoMaxSeconds('8')).toBe(8);
    expect(videoMaxSeconds('2')).toBe(4);
  });

  it('una duración pedida de 20/30 s se queda en 15', () => {
    delete process.env.VIDEO_MAX_SECONDS;
    expect(capVideoSeconds(20)).toBe(15);
    expect(capVideoSeconds(30)).toBe(15);
    expect(capVideoSeconds(undefined)).toBe(15);
    expect(capVideoSeconds(15)).toBe(15);
    expect(capVideoSeconds(6)).toBe(6);
  });

  it('reparte el total entre escenas (clips de Seedance 2–12 s)', () => {
    expect(clipSecondsForScenes(1, 15)).toBe(12);
    expect(clipSecondsForScenes(2, 15)).toBe(7);
    expect(clipSecondsForScenes(1, 10)).toBe(10);
    expect(clipSecondsForScenes(2, 10)).toBe(5);
    expect(maxScenesForDuration(15)).toBe(3);
    expect(maxScenesForDuration(10)).toBe(2);
    expect(maxScenesForDuration(8)).toBe(1);
  });

  it('plan por escena: suma el total sin pasar 12 s por clip', () => {
    expect(clipSecondsPlan(1, 15)).toEqual([12]);
    expect(clipSecondsPlan(2, 15)).toEqual([8, 7]);
    expect(clipSecondsPlan(3, 15)).toEqual([5, 5, 5]);
    expect(clipSecondsPlan(2, 10)).toEqual([5, 5]);
    expect(clipSecondsPlan(1, 10)).toEqual([10]);
    expect(clipSecondsPlan(4, 6)).toEqual([2, 2, 2, 2]);
    for (const n of [1, 2, 3]) {
      expect(clipSecondsPlan(n, 15).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(15);
    }
  });

  it('15 s de voz ≈ 39 palabras en español; 10 s ≈ 26', () => {
    expect(maxSpokenWords(15)).toBe(39);
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
