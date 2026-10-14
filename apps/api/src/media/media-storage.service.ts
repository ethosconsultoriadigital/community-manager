import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { LocalMediaStorage } from './local-media-storage';
import { S3MediaStorage } from './s3-media-storage';

export type SaveMediaInput = {
  agencyId: string;
  buffer: Buffer;
  extension: string;
  contentType: string;
};

export type SaveMediaResult = {
  storageUrl: string;
  storageKey: string;
};

/** Origen de bytes por rango. El llamador pide un tramo; no recibe el archivo entero. */
export type MediaRangeSource = {
  contentLength: number;
  contentType: string;
  readRange(start: number, endInclusive: number): Promise<Buffer>;
};

@Injectable()
export class MediaStorageService {
  private readonly local: LocalMediaStorage;
  private readonly s3: S3MediaStorage | null;

  constructor(private readonly config: ConfigService) {
    const apiPort = config.get<string>('API_PORT') ?? '4000';
    const publicBase =
      config.get<string>('MEDIA_PUBLIC_BASE_URL') ??
      `http://localhost:${apiPort}`;

    const uploadsDir =
      config.get<string>('MEDIA_UPLOADS_DIR') ??
      join(process.cwd(), 'uploads');

    this.local = new LocalMediaStorage(uploadsDir, publicBase);

    const bucket = config.get<string>('S3_BUCKET');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');

    if (bucket && accessKeyId && secretAccessKey) {
      const s3Public =
        config.get<string>('S3_PUBLIC_BASE_URL') ??
        `${publicBase.replace(/\/$/, '')}/media/s3`;
      this.s3 = new S3MediaStorage(
        bucket,
        s3Public,
        config.get<string>('S3_ENDPOINT') || undefined,
        config.get<string>('S3_REGION') || undefined,
        { accessKeyId, secretAccessKey },
      );
    } else {
      this.s3 = null;
    }
  }

  usesS3(): boolean {
    return this.s3 !== null;
  }

  async save(input: SaveMediaInput): Promise<SaveMediaResult> {
    if (this.s3) {
      const stored = await this.s3.save(
        input.agencyId,
        input.buffer,
        input.extension,
        input.contentType,
      );
      return { storageUrl: stored.publicUrl, storageKey: stored.storageKey };
    }

    const stored = await this.local.save(
      input.agencyId,
      input.buffer,
      input.extension,
    );
    return { storageUrl: stored.publicUrl, storageKey: stored.storageKey };
  }

  /** Preferible para MP4 grandes en Render (512MB): stream/copia sin buffer doble. */
  async saveFromFile(input: {
    agencyId: string;
    filePath: string;
    extension: string;
    contentType: string;
  }): Promise<SaveMediaResult> {
    if (this.s3) {
      const stored = await this.s3.saveFromFile(
        input.agencyId,
        input.filePath,
        input.extension,
        input.contentType,
      );
      return { storageUrl: stored.publicUrl, storageKey: stored.storageKey };
    }
    const stored = await this.local.saveFromFile(
      input.agencyId,
      input.filePath,
      input.extension,
    );
    return { storageUrl: stored.publicUrl, storageKey: stored.storageKey };
  }

  resolveLocalPath(storageKey: string): string {
    return this.local.resolvePath(storageKey);
  }

  /**
   * Abre el video para subirlo por partes (TikTok FILE_UPLOAD).
   * R2/S3 usa Range de GetObject; local usa read posicional.
   * Una URL externa solo se acepta si responde 206 a Range.
   */
  async openRangeSource(url: string): Promise<MediaRangeSource> {
    if (this.s3) {
      const key = this.s3.keyFromPublicUrl(url);
      if (key) return this.s3.openRange(key);
    }
    const localKey = this.local.keyFromPublicUrl(url);
    if (localKey) return this.local.openRange(localKey);
    return openHttpRangeSource(url);
  }

  /**
   * Lee bytes desde storage (S3/local) a partir de la URL pública.
   * Si no es URL de nuestro storage, descarga por HTTP (p. ej. imágenes externas).
   */
  async readBytesFromUrl(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (this.s3) {
      const key = this.s3.keyFromPublicUrl(url);
      if (key) return this.s3.read(key);
    }
    const localKey = this.local.keyFromPublicUrl(url);
    if (localKey) return this.local.read(localKey);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CommunityManager/1.0' },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`No se pudo descargar media (${response.status}): ${url}`);
    }
    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType,
    };
  }
}

/**
 * URL que no es nuestro storage. Exige Range (206). Si el servidor ignora
 * el rango y manda el archivo entero, se cancela el body.
 */
async function openHttpRangeSource(url: string): Promise<MediaRangeSource> {
  const head = await fetch(url, {
    method: 'HEAD',
    headers: { 'User-Agent': 'CommunityManager/1.0' },
    redirect: 'follow',
  });
  const contentLength = Number(head.headers.get('content-length'));
  if (!head.ok || !Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error(
      'El video debe estar en el almacenamiento de la app (R2 o local) para subirlo a TikTok por partes',
    );
  }
  const contentType =
    head.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';

  return {
    contentLength,
    contentType,
    readRange: async (start, endInclusive) => {
      const expected = endInclusive - start + 1;
      const response = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${endInclusive}`,
          'User-Agent': 'CommunityManager/1.0',
        },
        redirect: 'follow',
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error(
          'El origen del video no admite descargas por rango. Súbelo al almacenamiento de la app.',
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length !== expected) {
        throw new Error(
          `Tramo de video incompleto (${buffer.length}/${expected} bytes)`,
        );
      }
      return buffer;
    },
  };
}
