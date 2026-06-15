import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptToken,
  encryptToken,
  TokenEncryptionError,
} from './token-encryption';

const KEY = randomBytes(32).toString('base64');

describe('token encryption AES-256-GCM', () => {
  it('cifra y descifra correctamente', () => {
    const plain = 'EAABsbCS1iHgBO7ZAZBZC...meta_page_token';
    const encrypted = encryptToken(plain, KEY);
    expect(encrypted.equals(Buffer.from(plain))).toBe(false);
    expect(decryptToken(encrypted, KEY)).toBe(plain);
  });

  it('produce ciphertext distinto en cada cifrado (IV aleatorio)', () => {
    const a = encryptToken('same-token', KEY);
    const b = encryptToken('same-token', KEY);
    expect(a.equals(b)).toBe(false);
  });

  it('rechaza clave inválida', () => {
    expect(() => encryptToken('x', 'corta')).toThrow(TokenEncryptionError);
  });

  it('rechaza descifrado con clave incorrecta', () => {
    const encrypted = encryptToken('secret', KEY);
    const otherKey = randomBytes(32).toString('base64');
    expect(() => decryptToken(encrypted, otherKey)).toThrow();
  });
});
