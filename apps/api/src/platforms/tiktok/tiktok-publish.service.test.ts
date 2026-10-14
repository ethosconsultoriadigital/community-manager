import { describe, expect, it, vi } from 'vitest';
import {
  planTikTokFileUpload,
  pollTikTokPublishStatus,
  resolveTikTokPrivacyLevel,
  tikTokChunkRanges,
  tikTokContentRange,
  tikTokPublicPostId,
  tikTokTitle,
  TikTokPublishService,
  uploadTikTokFileChunks,
} from './tiktok-publish.service';

describe('planTikTokFileUpload', () => {
  it('sigue el ejemplo de TikTok: 50_000_123 bytes en 5 fragmentos de 10 MB', () => {
    const plan = planTikTokFileUpload(50_000_123);
    expect(plan).toEqual({ chunkSize: 10_000_000, totalChunkCount: 5 });
    const ranges = tikTokChunkRanges(50_000_123, plan);
    expect(ranges).toHaveLength(5);
    expect(ranges[0]).toEqual({ start: 0, endInclusive: 9_999_999 });
    expect(ranges[4]).toEqual({ start: 40_000_000, endInclusive: 50_000_122 });
    expect(tikTokContentRange(40_000_000, 50_000_122, 50_000_123)).toBe(
      'bytes 40000000-50000122/50000123',
    );
    const covered =
      ranges.reduce((sum, range) => sum + (range.endInclusive - range.start + 1), 0);
    expect(covered).toBe(50_000_123);
  });

  it('un video pequeño va en un solo fragmento del tamaño real', () => {
    expect(planTikTokFileUpload(25)).toEqual({ chunkSize: 25, totalChunkCount: 1 });
  });
});

describe('resolveTikTokPrivacyLevel', () => {
  it('fuerza SELF_ONLY cuando es la única opción del sandbox', () => {
    expect(resolveTikTokPrivacyLevel(['SELF_ONLY'])).toBe('SELF_ONLY');
  });

  it('sigue en SELF_ONLY si la lista también trae público', () => {
    expect(
      resolveTikTokPrivacyLevel(['PUBLIC_TO_EVERYONE', 'SELF_ONLY']),
    ).toBe('SELF_ONLY');
  });

  it('no publica si TikTok no ofrece privado', () => {
    expect(() => resolveTikTokPrivacyLevel(['PUBLIC_TO_EVERYONE'])).toThrow(
      /SELF_ONLY/,
    );
  });
});

describe('uploadTikTokFileChunks', () => {
  it('pide cada tramo por separado y no el archivo entero', async () => {
    const reads: Array<[number, number]> = [];
    const ranges: string[] = [];
    await uploadTikTokFileChunks({
      videoSize: 25,
      plan: { chunkSize: 10, totalChunkCount: 2 },
      readRange: async (start, endInclusive) => {
        reads.push([start, endInclusive]);
        return Buffer.alloc(endInclusive - start + 1, 7);
      },
      putChunk: async (chunk, contentRange) => {
        ranges.push(`${contentRange}:${chunk.length}`);
      },
    });
    expect(reads).toEqual([
      [0, 9],
      [10, 24],
    ]);
    expect(ranges).toEqual(['bytes 0-9/25:10', 'bytes 10-24/25:15']);
  });
});

describe('pollTikTokPublishStatus', () => {
  it('guarda el id público cuando TikTok lo devuelve', async () => {
    const id = await pollTikTokPublishStatus({
      publishId: 'pub-1',
      fetchStatus: async () => ({
        status: 'PUBLISH_COMPLETE',
        publicaly_available_post_id: [987654],
      }),
      sleep: async () => undefined,
    });
    expect(id).toBe('987654');
  });

  it('usa publish_id si todavía no hay id de post', () => {
    expect(tikTokPublicPostId('pub-1', { status: 'PUBLISH_COMPLETE' })).toBe('pub-1');
  });

  it('propaga fail_reason', async () => {
    await expect(
      pollTikTokPublishStatus({
        publishId: 'pub-1',
        fetchStatus: async () => ({
          status: 'FAILED',
          fail_reason: 'frame_rate_check_failed',
        }),
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('frame_rate_check_failed');
  });
});

describe('TikTokPublishService', () => {
  function setup(overrides?: {
    privacy?: string[];
    videoUrl?: string;
    status?: string;
    publicId?: number;
  }) {
    const tiktok = {
      queryCreatorInfo: vi.fn().mockResolvedValue({
        privacy_level_options: overrides?.privacy ?? ['SELF_ONLY'],
        comment_disabled: true,
        duet_disabled: false,
        stitch_disabled: true,
      }),
      initFileUpload: vi.fn().mockResolvedValue({
        publish_id: 'pub-9',
        upload_url: 'https://upload.tiktokapis.com/video?upload_id=1',
      }),
      uploadChunk: vi.fn().mockResolvedValue(undefined),
      fetchPublishStatus: vi.fn().mockResolvedValue({
        status: overrides?.status ?? 'PUBLISH_COMPLETE',
        publicaly_available_post_id:
          overrides?.publicId == null ? [4242] : [overrides.publicId],
      }),
    };
    const storage = {
      openRangeSource: vi.fn().mockResolvedValue({
        contentLength: 8,
        contentType: 'video/mp4',
        readRange: async (start: number, endInclusive: number) =>
          Buffer.alloc(endInclusive - start + 1, 1),
      }),
    };
    const service = new TikTokPublishService(tiktok as never, storage as never);
    return { service, tiktok, storage };
  }

  it('exige video', async () => {
    const { service } = setup();
    await expect(
      service.publish({
        platform: 'tiktok',
        externalAccountId: 'open-1',
        accessToken: 'tok',
        message: 'Hola',
      }),
    ).rejects.toThrow(/video/i);
  });

  it('inicializa FILE_UPLOAD, sube por rango y guarda el id del post', async () => {
    const { service, tiktok } = setup();
    const result = await service.publish({
      platform: 'tiktok',
      externalAccountId: 'open-1',
      accessToken: 'tok',
      message: '  Hola   TikTok  ',
      videoUrl: 'https://media.example/agency/clip.mp4',
      imageUrl: 'https://media.example/agency/thumb.jpg',
      placeId: 'place-1',
      alsoPublishAsStory: true,
    });

    expect(tiktok.initFileUpload).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({
        post_info: expect.objectContaining({
          title: 'Hola TikTok',
          privacy_level: 'SELF_ONLY',
          disable_comment: true,
          disable_stitch: true,
          disable_duet: false,
        }),
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: 8,
          chunk_size: 8,
          total_chunk_count: 1,
        },
      }),
    );
    const initBody = tiktok.initFileUpload.mock.calls[0][1] as {
      post_info: Record<string, unknown>;
    };
    expect(initBody.post_info.place_id).toBeUndefined();
    expect(tiktok.uploadChunk).toHaveBeenCalledWith(
      'https://upload.tiktokapis.com/video?upload_id=1',
      expect.any(Buffer),
      'bytes 0-7/8',
      'video/mp4',
    );
    expect((tiktok.uploadChunk.mock.calls[0][1] as Buffer).length).toBe(8);
    expect(result.platformPostId).toBe('4242');
    expect(result.storyStatus).toBe('skipped');
    expect(result.storyErrorMessage).toMatch(/Stories/);
  });

  it('recorta el título al tope de TikTok', () => {
    expect(tikTokTitle('a'.repeat(2300))).toHaveLength(2200);
  });
});
