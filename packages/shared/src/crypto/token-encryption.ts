import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class TokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenEncryptionError';
  }
}

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new TokenEncryptionError(
      `TOKEN_ENCRYPTION_KEY debe ser ${KEY_LENGTH} bytes en base64`,
    );
  }
  return key;
}

/** Cifra un token OAuth con AES-256-GCM. Formato: iv(12) + tag(16) + ciphertext */
export function encryptToken(plaintext: string, keyBase64: string): Buffer {
  const key = parseKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function toBuffer(payload: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
}

/** Descifra un token almacenado con encryptToken. */
export function decryptToken(payload: Buffer | Uint8Array, keyBase64: string): string {
  const data = toBuffer(payload);
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new TokenEncryptionError('Payload cifrado inválido');
  }

  const key = parseKey(keyBase64);
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
