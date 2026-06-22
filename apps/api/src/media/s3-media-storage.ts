import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export type StoredMedia = {
  storageKey: string;
  publicUrl: string;
};

export class S3MediaStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
    endpoint?: string,
    region?: string,
    credentials?: { accessKeyId: string; secretAccessKey: string },
  ) {
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

    const publicUrl = `${this.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;
    return { storageKey, publicUrl };
  }
}
