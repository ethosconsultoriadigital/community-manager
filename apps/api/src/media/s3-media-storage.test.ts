import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor(config: unknown) {
      constructed.push(config);
    }
    send = send;
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand: class {},
    HeadObjectCommand: class {},
  };
});

import { S3MediaStorage } from './s3-media-storage';

describe('S3MediaStorage.saveFromFile', () => {
  beforeEach(() => {
    send.mockClear();
    constructed.length = 0;
  });

  it('sube el MP4 con ContentLength y sin checksums aws-chunked (R2)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cm-s3-'));
    const file = join(dir, 'clip.mp4');
    await writeFile(file, Buffer.from('mp4-bytes'));
    try {
      const storage = new S3MediaStorage(
        'bucket',
        'https://cdn.example',
        'https://r2.example',
        'auto',
        { accessKeyId: 'a', secretAccessKey: 's' },
      );
      const stored = await storage.saveFromFile('agency-1', file, 'mp4', 'video/mp4');

      expect(constructed[0]).toMatchObject({
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        forcePathStyle: true,
      });
      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0][0] as { input: Record<string, unknown> };
      expect(command.input.ContentLength).toBe(9);
      expect(command.input.ContentType).toBe('video/mp4');
      expect(command.input.Key).toMatch(/^agency-1\/.+\.mp4$/);
      expect(stored.publicUrl).toMatch(/^https:\/\/cdn\.example\/agency-1\//);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});