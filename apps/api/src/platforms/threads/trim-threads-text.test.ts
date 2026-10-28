import { describe, expect, it } from 'vitest';
import { codePointLength, THREADS_TEXT_LIMIT, trimThreadsText } from './trim-threads-text';

describe('trimThreadsText', () => {
  it('no toca un texto corto', () => {
    expect(trimThreadsText('Hola Threads. https://blog.example/n')).toBe(
      'Hola Threads. https://blog.example/n',
    );
  });

  it('corta en la última frase que cabe, conserva el enlace y no pasa de 500', () => {
    const first = 'Esta es la primera frase completa.';
    const link = 'https://blog.example/nota-aab';
    const tail = `…\n\n${link}`;
    const budget = THREADS_TEXT_LIMIT - codePointLength(tail);
    const overflow = 'X'.repeat(budget);
    const text = `${first} ${overflow}\n\n${link}`;

    const trimmed = trimThreadsText(text);

    expect(codePointLength(text)).toBeGreaterThan(THREADS_TEXT_LIMIT);
    expect(codePointLength(trimmed)).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
    expect(trimmed.startsWith(first)).toBe(true);
    expect(trimmed).not.toContain('XXX');
    expect(trimmed).toContain('…');
    expect(trimmed.endsWith(link)).toBe(true);
  });

  it('cuenta puntos de código, no unidades UTF-16', () => {
    const emoji = '😀';
    expect(emoji.length).toBe(2);
    expect(codePointLength(emoji)).toBe(1);
    const text = `${emoji.repeat(499)} Frase que sobra y debe caerse.`;
    const trimmed = trimThreadsText(text);
    expect(codePointLength(trimmed)).toBeLessThanOrEqual(THREADS_TEXT_LIMIT);
    expect(trimmed.endsWith('…')).toBe(true);
  });
});
