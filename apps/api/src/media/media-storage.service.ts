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

  resolveLocalPath(storageKey: string): string {
    return this.local.resolvePath(storageKey);
  }
}
