import { Injectable, Logger } from '@nestjs/common';
import type { MediaRangeSource } from '../../media/media-storage.service';
import { MediaStorageService } from '../../media/media-storage.service';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { TikTokApiClient } from './tiktok-api.client';
import {
  TIKTOK_PRIVACY_SELF_ONLY,
  TIKTOK_STATUS_MAX_WAIT_MS,
  TIKTOK_STATUS_POLL_MS,
  TIKTOK_TARGET_CHUNK_BYTES,
  TIKTOK_TITLE_MAX,
  type TikTokFileUploadPlan,
  type TikTokPublishStatus,
} from './tiktok.types';

export type TikTokByteRange = { start: number; endInclusive: number };

/**
 * Plan FILE_UPLOAD.
 * Videos que caben en el fragmento objetivo (10 MB) van en un solo PUT
 * (`chunk_size` = tamaño real, aunque sea menor de 5 MB: excepción de TikTok).
 * Por encima, fragmentos de 10 MB y el resto se suma al último
 * (`total_chunk_count = floor(size / chunk)`), como en la guía de TikTok
 * (50_000_123 bytes → 5 fragmentos de 10_000_000, el último más largo).
 */
export function planTikTokFileUpload(videoSize: number): TikTokFileUploadPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error('El video de TikTok está vacío');
  }
  if (videoSize <= TIKTOK_TARGET_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  const chunkSize = TIKTOK_TARGET_CHUNK_BYTES;
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  if (totalChunkCount <= 1) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }
  return { chunkSize, totalChunkCount };
}

export function tikTokChunkRanges(
  videoSize: number,
  plan: TikTokFileUploadPlan,
): TikTokByteRange[] {
  if (plan.totalChunkCount < 1 || plan.chunkSize <= 0) {
    throw new Error('Plan de subida TikTok inválido');
  }
  const ranges: TikTokByteRange[] = [];
  for (let i = 0; i < plan.totalChunkCount; i += 1) {
    const start = i * plan.chunkSize;
    if (start >= videoSize) {
      throw new Error('Plan de subida TikTok fuera del tamaño del video');
    }
    const endInclusive =
      i === plan.totalChunkCount - 1 ? videoSize - 1 : start + plan.chunkSize - 1;
    ranges.push({ start, endInclusive });
  }
  return ranges;
}

export function tikTokContentRange(
  start: number,
  endInclusive: number,
  videoSize: number,
): string {
  return `bytes ${start}-${endInclusive}/${videoSize}`;
}

/**
 * App en sandbox: TikTok solo ofrece SELF_ONLY hasta la auditoría.
 * Si aparece en la lista (sola o con más opciones) se usa siempre,
 * para no publicar en público por accidente. Si la lista no lo trae, se aborta.
 */
export function resolveTikTokPrivacyLevel(options: string[] | undefined): string {
  const levels = [
    ...new Set((options ?? []).map((level) => level.trim()).filter(Boolean)),
  ];
  if (levels.length === 0 || levels.includes(TIKTOK_PRIVACY_SELF_ONLY)) {
    return TIKTOK_PRIVACY_SELF_ONLY;
  }
  throw new Error(
    'TikTok no ofrece publicar en privado (SELF_ONLY) para esta cuenta. No se publica en público mientras la app está en sandbox.',
  );
}

export function tikTokTitle(message: string | undefined): string {
  const text = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Video';
  return text.length <= TIKTOK_TITLE_MAX ? text : text.slice(0, TIKTOK_TITLE_MAX);
}

export function tikTokVideoContentType(contentType: string | undefined): string {
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'video/mp4' || mime === 'video/quicktime') return mime;
  if (mime === '' || mime === 'application/octet-stream') return 'video/mp4';
  throw new Error(`TikTok solo acepta MP4 o MOV (recibido ${mime})`);
}

export function tikTokPublicPostId(
  publishId: string,
  status: TikTokPublishStatus,
): string {
  const raw =
    status.publicaly_available_post_id ?? status.publicly_available_post_id;
  const id = Array.isArray(raw) ? raw[0] : undefined;
  if (id == null || id === '') return publishId;
  return String(id);
}

export async function uploadTikTokFileChunks(input: {
  videoSize: number;
  plan: TikTokFileUploadPlan;
  readRange: MediaRangeSource['readRange'];
  putChunk: (chunk: Buffer, contentRange: string) => Promise<void>;
}): Promise<void> {
  const ranges = tikTokChunkRanges(input.videoSize, input.plan);
  for (const range of ranges) {
    const expected = range.endInclusive - range.start + 1;
    const chunk = await input.readRange(range.start, range.endInclusive);
    if (chunk.length !== expected) {
      throw new Error(
        `Fragmento TikTok incompleto (${chunk.length}/${expected} bytes)`,
      );
    }
    await input.putChunk(
      chunk,
      tikTokContentRange(range.start, range.endInclusive, input.videoSize),
    );
  }
}

export async function pollTikTokPublishStatus(input: {
  publishId: string;
  fetchStatus: () => Promise<TikTokPublishStatus>;
  pollMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const pollMs = input.pollMs ?? TIKTOK_STATUS_POLL_MS;
  const maxWaitMs = input.maxWaitMs ?? TIKTOK_STATUS_MAX_WAIT_MS;
  const now = input.now ?? Date.now;
  const sleep =
    input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();

  for (;;) {
    const status = await input.fetchStatus();
    const state = status.status ?? '';
    if (state === 'PUBLISH_COMPLETE') {
      return tikTokPublicPostId(input.publishId, status);
    }
    if (state === 'FAILED') {
      throw new Error(status.fail_reason?.trim() || 'TikTok rechazó el video');
    }
    if (state === 'SEND_TO_USER_INBOX') {
      throw new Error(
        'TikTok envió el video a la bandeja en lugar de publicarlo. Revisa el scope video.publish.',
      );
    }
    if (now() - started >= maxWaitMs) {
      throw new Error('TikTok no confirmó la publicación a tiempo');
    }
    await sleep(pollMs);
  }
}

@Injectable()
export class TikTokPublishService implements PlatformPublisher {
  private readonly logger = new Logger(TikTokPublishService.name);

  constructor(
    private readonly tiktok: TikTokApiClient,
    private readonly storage: MediaStorageService,
  ) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    if (input.platform !== 'tiktok') {
      throw new Error(`TikTokPublishService no soporta plataforma ${input.platform}`);
    }
    if (!input.videoUrl?.trim()) {
      throw new Error('TikTok requiere un video adjunto (no publica solo texto o imagen)');
    }
    if (input.placeId) {
      this.logger.debug('TikTok ignora place_id; la API no admite ubicación');
    }

    const creator = await this.tiktok.queryCreatorInfo(input.accessToken);
    const privacyLevel = resolveTikTokPrivacyLevel(creator.privacy_level_options);
    const source = await this.storage.openRangeSource(input.videoUrl);
    const contentType = tikTokVideoContentType(source.contentType);
    const plan = planTikTokFileUpload(source.contentLength);

    this.logger.log(
      `TikTok init: ${source.contentLength} bytes en ${plan.totalChunkCount} fragmento(s), privacidad ${privacyLevel}`,
    );

    const init = await this.tiktok.initFileUpload(input.accessToken, {
      post_info: {
        title: tikTokTitle(input.message),
        privacy_level: privacyLevel,
        disable_duet: Boolean(creator.duet_disabled),
        disable_comment: Boolean(creator.comment_disabled),
        disable_stitch: Boolean(creator.stitch_disabled),
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: source.contentLength,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    });

    await uploadTikTokFileChunks({
      videoSize: source.contentLength,
      plan,
      readRange: (start, endInclusive) => source.readRange(start, endInclusive),
      putChunk: (chunk, contentRange) =>
        this.tiktok.uploadChunk(init.upload_url, chunk, contentRange, contentType),
    });

    const platformPostId = await pollTikTokPublishStatus({
      publishId: init.publish_id,
      fetchStatus: () => this.tiktok.fetchPublishStatus(input.accessToken, init.publish_id),
    });

    this.logger.log(
      `TikTok publicado: ${platformPostId} (publish_id ${init.publish_id})`,
    );

    return {
      platformPostId,
      storyStatus: input.alsoPublishAsStory ? 'skipped' : undefined,
      storyErrorMessage: input.alsoPublishAsStory
        ? 'Stories no aplica a TikTok'
        : undefined,
    };
  }
}
