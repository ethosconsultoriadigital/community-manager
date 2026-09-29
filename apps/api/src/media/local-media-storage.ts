import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type StoredMedia = {
  storageKey: string;
  publicUrl: string;
};

export type ReadMediaResult = {
  buffer: Buffer;
  contentType: string;
};

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export class LocalMediaStorage {
  readonly publicBaseUrl: string;

  constructor(
    private readonly uploadsDir: string,
    publicBaseUrl: string,
  ) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  async save(
    agencyId: string,
    buffer: Buffer,
    extension: string,
  ): Promise<StoredMedia> {
    const fileName = `${randomUUID()}.${extension}`;
    const agencyDir = join(this.uploadsDir, agencyId);
    await mkdir(agencyDir, { recursive: true });
    const filePath = join(agencyDir, fileName);
    await writeFile(filePath, buffer);

    const storageKey = `${agencyId}/${fileName}`;
    const publicUrl = `${this.publicBaseUrl}/media/files/${storageKey}`;
    return { storageKey, publicUrl };
  }

  resolvePath(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/');
    if (normalized.includes('..') || !normalized.includes('/')) {
      throw new Error('Clave de almacenamiento inválida');
    }
    return join(this.uploadsDir, normalized);
  }

  async read(storageKey: string): Promise<ReadMediaResult> {
    const path = this.resolvePath(storageKey);
    const buffer = await readFile(path);
    const mime = EXT_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    return { buffer, contentType: mime };
  }

  keyFromPublicUrl(url: string): string | null {
    const marker = '/media/files/';
    const idx = url.indexOf(marker);
    if (idx < 0) return null;
    const key = url.slice(idx + marker.length).split('?')[0];
    return key.includes('/') && !key.includes('..') ? key : null;
  }
}
