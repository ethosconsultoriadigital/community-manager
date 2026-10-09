import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
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

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: createReadStream(filePath),
        ContentType: contentType,
      }),
    );

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

  /** Extrae storageKey si la URL pública pertenece a este storage. */
  keyFromPublicUrl(url: string): string | null {
    const base = `${this.publicBaseUrl}/`;
    if (!url.startsWith(base)) return null;
    const key = url.slice(base.length).split('?')[0];
    return key.includes('/') && !key.includes('..') ? key : null;
  }
}
