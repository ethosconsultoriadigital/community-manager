import { Injectable, Logger } from '@nestjs/common';
import { MediaStorageService } from '../../media/media-storage.service';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { XApiClient } from './x-api.client';
import {
  X_MAX_IMAGE_BYTES,
  X_MAX_IMAGES,
  X_TWEET_MAX_LENGTH,
} from './x.types';

/**
 * Parte un caption en chunks ≤ maxLen, preferiendo cortes en espacio/salto.
 * Si un segmento supera maxLen sin espacios, corta duro.
 */
export function splitCaptionForTweets(
  caption: string,
  maxLen = X_TWEET_MAX_LENGTH,
): string[] {
  const text = caption.trim();
  if (!text) return [' '];
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    const window = remaining.slice(0, maxLen);
    const breakAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const cut = breakAt > maxLen * 0.4 ? breakAt : maxLen;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  return parts.filter((p) => p.length > 0);
}

function normalizeMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

function extensionForMime(mime: string): string {
  switch (normalizeMime(mime)) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

@Injectable()
export class XPublishService implements PlatformPublisher {
  private readonly logger = new Logger(XPublishService.name);

  constructor(
    private readonly x: XApiClient,
    private readonly storage: MediaStorageService,
  ) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    if (input.platform !== 'x') {
      throw new Error(`XPublishService no soporta plataforma ${input.platform}`);
    }

    if (input.videoUrl) {
      throw new Error(
        'X aún no soporta video en esta versión; quita el video o publica solo imagen/texto',
      );
    }

    const imageUrls = this.resolveImageUrls(input);
    const mediaIds =
      imageUrls.length > 0
        ? await this.uploadImages(
            input.accessToken,
            imageUrls,
            input.postId ?? input.agencyId ?? 'n/a',
          )
        : [];

    const chunks = splitCaptionForTweets(input.message ?? '');
    let previousId: string | undefined;
    let rootId = '';

    for (let i = 0; i < chunks.length; i += 1) {
      const tweet = await this.x.createTweet(input.accessToken, chunks[i], {
        inReplyToTweetId: previousId,
        mediaIds: i === 0 && mediaIds.length > 0 ? mediaIds : undefined,
      });
      if (!rootId) rootId = tweet.id;
      previousId = tweet.id;
    }

    this.logger.log(
      chunks.length > 1
        ? `X hilo publicado (${chunks.length} tweets), raíz ${rootId}`
        : `X tweet publicado: ${rootId}`,
    );

    return {
      platformPostId: rootId,
      storyStatus: input.alsoPublishAsStory ? 'skipped' : undefined,
      storyErrorMessage: input.alsoPublishAsStory
        ? 'Stories no aplica a X en esta versión'
        : undefined,
    };
  }

  private resolveImageUrls(input: PublishTargetInput): string[] {
    const fromList = (input.imageUrls ?? []).filter(Boolean);
    if (fromList.length > 0) return fromList.slice(0, X_MAX_IMAGES);
    if (input.imageUrl) return [input.imageUrl];
    return [];
  }

  private async uploadImages(
    accessToken: string,
    imageUrls: string[],
    postRef: string,
  ): Promise<string[]> {
    this.logger.log(
      `X media: ${imageUrls.length} imagen(es) encontradas para post ${postRef}`,
    );

    const mediaIds: string[] = [];
    for (const url of imageUrls) {
      try {
        const { buffer, contentType } = await this.storage.readBytesFromUrl(url);
        const mime = normalizeMime(contentType);
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
          throw new Error(`Formato de imagen no soportado en X: ${mime || 'desconocido'}`);
        }
        if (buffer.length > X_MAX_IMAGE_BYTES) {
          throw new Error(
            `Imagen supera 5 MB (${Math.round(buffer.length / 1024)} KB)`,
          );
        }
        if (buffer.length < 32) {
          throw new Error('Imagen vacía o demasiado pequeña');
        }

        const uploaded = await this.x.uploadImage(
          accessToken,
          buffer,
          mime,
          `image.${extensionForMime(mime)}`,
        );
        this.logger.log(
          `X media subida: ${uploaded.id} (${buffer.length} bytes, ${mime})`,
        );
        mediaIds.push(uploaded.id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(`X media falló al procesar imagen: ${msg}`);
        throw error;
      }
    }
    return mediaIds;
  }
}
