import { Injectable, Logger } from '@nestjs/common';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { ThreadsApiClient } from './threads-api.client';

@Injectable()
export class ThreadsPublishService implements PlatformPublisher {
  private readonly logger = new Logger(ThreadsPublishService.name);

  constructor(private readonly threads: ThreadsApiClient) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    if (input.platform !== 'threads') {
      throw new Error(`ThreadsPublishService no soporta plataforma ${input.platform}`);
    }

    const userId = input.externalAccountId;
    const token = input.accessToken;
    const text = input.message?.trim() || ' ';

    let container: { id: string };
    if (input.videoUrl) {
      container = await this.threads.createVideoContainer(userId, token, input.videoUrl, text);
      await this.threads.waitForContainer(container.id, token);
    } else if (input.imageUrl) {
      container = await this.threads.createImageContainer(userId, token, input.imageUrl, text);
      await this.threads.waitForContainer(container.id, token);
    } else {
      container = await this.threads.createTextContainer(userId, token, text);
    }

    const published = await this.threads.publishContainer(userId, token, container.id);
    this.logger.log(`Threads publicado: ${published.id}`);

    return {
      platformPostId: published.id,
      // Threads no usa el mismo modelo de Stories de Meta
      storyStatus: input.alsoPublishAsStory ? 'skipped' : undefined,
      storyErrorMessage: input.alsoPublishAsStory
        ? 'Stories no aplica a Threads en esta versión'
        : undefined,
    };
  }
}
