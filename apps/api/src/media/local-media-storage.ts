import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type StoredMedia = {
  storageKey: string;
  publicUrl: string;
};

export class LocalMediaStorage {
  constructor(
    private readonly uploadsDir: string,
    private readonly publicBaseUrl: string,
  ) {}

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
    const publicUrl = `${this.publicBaseUrl.replace(/\/$/, '')}/media/files/${storageKey}`;
    return { storageKey, publicUrl };
  }

  resolvePath(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/');
    if (normalized.includes('..') || !normalized.includes('/')) {
      throw new Error('Clave de almacenamiento inválida');
    }
    return join(this.uploadsDir, normalized);
  }
}
