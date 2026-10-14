import { copyFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
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
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
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

  async saveFromFile(
    agencyId: string,
    sourcePath: string,
    extension: string,
  ): Promise<StoredMedia> {
    const fileName = `${randomUUID()}.${extension}`;
    const agencyDir = join(this.uploadsDir, agencyId);
    await mkdir(agencyDir, { recursive: true });
    const filePath = join(agencyDir, fileName);
    await copyFile(sourcePath, filePath);

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

  /** stat + read posicional: un tramo, no el archivo entero. */
  async openRange(storageKey: string): Promise<{
    contentLength: number;
    contentType: string;
    readRange: (start: number, endInclusive: number) => Promise<Buffer>;
  }> {
    const path = this.resolvePath(storageKey);
    const info = await stat(path);
    const contentType = EXT_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    return {
      contentLength: info.size,
      contentType,
      readRange: async (start, endInclusive) => {
        const length = endInclusive - start + 1;
        if (length <= 0) {
          throw new Error('Rango de lectura vacío');
        }
        const handle = await open(path, 'r');
        try {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buf, 0, length, start);
          if (bytesRead !== length) {
            throw new Error(`Lectura incompleta del video (${bytesRead}/${length})`);
          }
          return buf;
        } finally {
          await handle.close();
        }
      },
    };
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
