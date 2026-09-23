import { Injectable, Logger } from '@nestjs/common';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { XApiClient } from './x-api.client';
import { X_TWEET_MAX_LENGTH } from './x.types';

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

@Injectable()
export class XPublishService implements PlatformPublisher {
  private readonly logger = new Logger(XPublishService.name);

  constructor(private readonly x: XApiClient) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    if (input.platform !== 'x') {
      throw new Error(`XPublishService no soporta plataforma ${input.platform}`);
    }

    if (input.imageUrl || input.videoUrl) {
      this.logger.warn(
        'X MVP: se publica solo texto; media/imagen/video aún no se adjuntan al tweet',
      );
    }

    const chunks = splitCaptionForTweets(input.message ?? '');
    let previousId: string | undefined;
    let rootId = '';

    for (const chunk of chunks) {
      const tweet = await this.x.createTweet(input.accessToken, chunk, previousId);
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
}
