import { Injectable } from '@nestjs/common';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { MetaGraphClient } from './meta-graph.client';

@Injectable()
export class MetaPublishService implements PlatformPublisher {
  constructor(private readonly meta: MetaGraphClient) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    switch (input.platform) {
      case 'facebook':
        return this.publishFacebook(input);
      case 'instagram':
        return this.publishInstagram(input);
    }
  }

  private async publishFacebook(input: PublishTargetInput): Promise<PublishResult> {
    const result = await this.meta.publishFacebookFeed(
      input.externalAccountId,
      input.accessToken,
      input.message,
    );
    return { platformPostId: result.id };
  }

  private async publishInstagram(input: PublishTargetInput): Promise<PublishResult> {
    if (!input.imageUrl) {
      throw new Error('Instagram requiere una imagen (media_assets con URL pública)');
    }

    const container = await this.meta.createInstagramMedia(
      input.externalAccountId,
      input.accessToken,
      input.imageUrl,
      input.message,
    );
    const published = await this.meta.publishInstagramMedia(
      input.externalAccountId,
      input.accessToken,
      container.id,
    );
    return { platformPostId: published.id };
  }
}
