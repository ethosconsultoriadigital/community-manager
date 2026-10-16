import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type StoredMedia = {
  storageKey: string;
  publicUrl: string;
};

export type ReadMediaResult = {
  buffer: Buffer;
  contentType: string;
};

export class S3MediaStorage {
  private readonly client: S3Client;
  readonly publicBaseUrl: string;

  constructor(
    private readonly bucket: string,
    publicBaseUrl: string,
    endpoint?: string,
    region?: string,
    credentials?: { accessKeyId: string; secretAccessKey: string },
  ) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.client = new S3Client({
      region: region ?? 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials,
      // AWS SDK v3 calcula checksums por defecto y, con un stream, usa
      // aws-chunked. Cloudflare R2 responde NotImplemented y el Reel/avatar
      // falla al guardar. WHEN_REQUIRED deja las fotos (buffer) y los videos.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async save(
    agencyId: string,
    buffer: Buffer,
    extension: string,
    contentType: string,
  ): Promise<StoredMedia> {
    const fileName = `${randomUUID()}.${extension}`;
    const storageKey = `${agencyId}/${fileName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    const publicUrl = `${this.publicBaseUrl}/${storageKey}`;
    return { storageKey, publicUrl };
  }

  /** Sube desde disco (stream) sin cargar el MP4 entero en heap. */
  async saveFromFile(
    agencyId: string,
    filePath: string,
    extension: string,
    contentType: string,
  ): Promise<StoredMedia> {
    const fileName = `${randomUUID()}.${extension}`;
    const storageKey = `${agencyId}/${fileName}`;
    const size = (await stat(filePath)).size;
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error('El video compuesto está vacío y no se puede guardar');
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`No se pudo guardar el video en el almacenamiento: ${detail}`);
    }

    const publicUrl = `${this.publicBaseUrl}/${storageKey}`;
    return { storageKey, publicUrl };
  }

  async read(storageKey: string): Promise<ReadMediaResult> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
    if (!response.Body) {
      throw new Error(`S3 sin cuerpo para key ${storageKey}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  /**
   * Metadatos + lectura por rango. Cada readRange baja solo ese tramo (R2/S3),
   * no el objeto entero.
   */
  async openRange(storageKey: string): Promise<{
    contentLength: number;
    contentType: string;
    readRange: (start: number, endInclusive: number) => Promise<Buffer>;
  }> {
    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
    if (head.ContentLength == null) {
      throw new Error(`S3 sin tamaño para key ${storageKey}`);
    }
    const contentLength = head.ContentLength;
    const contentType = head.ContentType ?? 'application/octet-stream';
    return {
      contentLength,
      contentType,
      readRange: async (start, endInclusive) => {
        const response = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Range: `bytes=${start}-${endInclusive}`,
          }),
        );
        if (!response.Body) {
          throw new Error(`S3 sin cuerpo para rango ${start}-${endInclusive}`);
        }
        const bytes = await response.Body.transformToByteArray();
        return Buffer.from(bytes);
      },
    };
  }

  /** Extrae storageKey si la URL pública pertenece a este storage. */
  keyFromPublicUrl(url: string): string | null {
    const base = `${this.publicBaseUrl}/`;
    if (!url.startsWith(base)) return null;
    const key = url.slice(base.length).split('?')[0];
    return key.includes('/') && !key.includes('..') ? key : null;
  }
}
