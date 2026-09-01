import { Injectable, Logger } from '@nestjs/common';
import type {
  PlatformPublisher,
  PublishResult,
  PublishTargetInput,
} from '../platform-publisher.interface';
import { MetaGraphClient } from './meta-graph.client';
import { StoryMediaComposerService } from './story-media-composer.service';

@Injectable()
export class MetaPublishService implements PlatformPublisher {
  private readonly logger = new Logger(MetaPublishService.name);

  constructor(
    private readonly meta: MetaGraphClient,
    private readonly storyComposer: StoryMediaComposerService,
  ) {}

  async publish(input: PublishTargetInput): Promise<PublishResult> {
    const alsoStory = Boolean(input.alsoPublishAsStory);
    const hasMedia = Boolean(input.imageUrl || input.videoUrl);

    if (alsoStory && !hasMedia) {
      const feed = await this.publishFeedOnly(input);
      return {
        ...feed,
        storyStatus: 'skipped',
        storyErrorMessage: 'Story requiere imagen o video',
      };
    }

    if (input.platform === 'facebook' && alsoStory && hasMedia) {
      return this.publishFacebookFeedAndStory(input);
    }

    const feed = await this.publishFeedOnly(input);
    if (!alsoStory || !hasMedia) {
      return feed;
    }

    return this.publishInstagramFeedAndStory(input, feed);
  }

  private async publishFeedOnly(input: PublishTargetInput): Promise<PublishResult> {
    switch (input.platform) {
      case 'facebook':
        return { platformPostId: (await this.publishFacebookFeedOnly(input)).platformPostId };
      case 'instagram':
        return { platformPostId: (await this.publishInstagramFeedOnly(input)).platformPostId };
    }
  }

  private async publishFacebookFeedAndStory(
    input: PublishTargetInput,
  ): Promise<PublishResult> {
    let storyPlatformPostId: string | undefined;
    let storyStatus: PublishResult['storyStatus'];
    let storyErrorMessage: string | undefined;

    try {
      storyPlatformPostId = await this.publishFacebookStory(input);
      storyStatus = 'published';
    } catch (error) {
      storyStatus = 'failed';
      storyErrorMessage =
        error instanceof Error ? error.message : 'Error al publicar Story en Facebook';
    }

    const feed = await this.publishFacebookFeedOnly(input);

    return {
      platformPostId: feed.platformPostId,
      storyPlatformPostId,
      storyStatus,
      storyErrorMessage,
    };
  }

  private async publishInstagramFeedAndStory(
    input: PublishTargetInput,
    feed: PublishResult,
  ): Promise<PublishResult> {
    let storyPlatformPostId: string | undefined;
    let storyStatus: PublishResult['storyStatus'];
    let storyErrorMessage: string | undefined;

    try {
      storyPlatformPostId = await this.publishInstagramStory(input);
      storyStatus = 'published';
    } catch (error) {
      storyStatus = 'failed';
      storyErrorMessage =
        error instanceof Error ? error.message : 'Error al publicar Story en Instagram';
    }

    return {
      ...feed,
      storyPlatformPostId,
      storyStatus,
      storyErrorMessage,
    };
  }

  private async publishFacebookStory(input: PublishTargetInput): Promise<string> {
    const { externalAccountId, accessToken, imageUrl, videoUrl } = input;
    const storyImageUrl = await this.resolveStoryImageUrl(input);

    if (videoUrl) {
      const started = await this.meta.startFacebookVideoStory(
        externalAccountId,
        accessToken,
      );
      await this.meta.uploadFacebookStoryVideoFromUrl(
        started.video_id,
        accessToken,
        videoUrl,
      );
      const finished = await this.meta.finishFacebookVideoStory(
        externalAccountId,
        accessToken,
        started.video_id,
      );
      return finished.post_id ?? started.video_id;
    }

    if (!storyImageUrl && !imageUrl) {
      throw new Error('Story de Facebook requiere imagen o video');
    }

    const uploaded = await this.meta.uploadFacebookUnpublishedPhoto(
      externalAccountId,
      accessToken,
      storyImageUrl ?? imageUrl!,
    );
    const story = await this.meta.publishFacebookPhotoStory(
      externalAccountId,
      accessToken,
      uploaded.id,
    );
    return story.post_id ?? uploaded.id;
  }

  private async publishInstagramStory(input: PublishTargetInput): Promise<string> {
    const { externalAccountId, accessToken, imageUrl, videoUrl } = input;
    const storyImageUrl = await this.resolveStoryImageUrl(input);

    let container: { id: string };
    if (videoUrl) {
      container = await this.meta.createInstagramStoryVideoMedia(
        externalAccountId,
        accessToken,
        videoUrl,
      );
      await this.meta.waitForInstagramContainer(container.id, accessToken);
    } else if (storyImageUrl || imageUrl) {
      container = await this.meta.createInstagramStoryImageMedia(
        externalAccountId,
        accessToken,
        storyImageUrl ?? imageUrl!,
      );
      await this.meta.waitForInstagramContainer(container.id, accessToken);
    } else {
      throw new Error('Story de Instagram requiere imagen o video');
    }

    const published = await this.meta.publishInstagramMedia(
      externalAccountId,
      accessToken,
      container.id,
    );
    return published.id;
  }

  private async publishFacebookFeedOnly(
    input: PublishTargetInput,
  ): Promise<PublishResult> {
    if (input.videoUrl) {
      const result = await this.meta.publishFacebookVideo(
        input.externalAccountId,
        input.accessToken,
        input.videoUrl,
        input.message,
      );
      return { platformPostId: result.id };
    }

    if (input.imageUrl) {
      const result = await this.meta.publishFacebookPhoto(
        input.externalAccountId,
        input.accessToken,
        input.imageUrl,
        input.message,
      );
      return { platformPostId: result.id };
    }

    const result = await this.meta.publishFacebookFeed(
      input.externalAccountId,
      input.accessToken,
      input.message,
    );
    return { platformPostId: result.id };
  }

  private async publishInstagramFeedOnly(
    input: PublishTargetInput,
  ): Promise<PublishResult> {
    if (input.videoUrl) {
      const asReelOnly = input.videoFormat === 'reel';
      const container = await this.meta.createInstagramReelsMedia(
        input.externalAccountId,
        input.accessToken,
        input.videoUrl,
        input.message,
        !asReelOnly,
      );
      await this.meta.waitForInstagramContainer(container.id, input.accessToken);
      const published = await this.meta.publishInstagramMedia(
        input.externalAccountId,
        input.accessToken,
        container.id,
      );
      return { platformPostId: published.id };
    }

    if (!input.imageUrl) {
      throw new Error('Instagram requiere una imagen o video (media_assets con URL pública)');
    }

    const container = await this.meta.createInstagramMedia(
      input.externalAccountId,
      input.accessToken,
      input.imageUrl,
      input.message,
    );
    await this.meta.waitForInstagramContainer(container.id, input.accessToken);
    const published = await this.meta.publishInstagramMedia(
      input.externalAccountId,
      input.accessToken,
      container.id,
    );
    return { platformPostId: published.id };
  }

  private async resolveStoryImageUrl(input: PublishTargetInput): Promise<string | undefined> {
    if (!input.imageUrl || !input.message.trim() || !input.agencyId) {
      return input.imageUrl;
    }

    try {
      return await this.storyComposer.composeStoryImage(
        input.imageUrl,
        input.message,
        input.agencyId,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo componer story con caption; se usa imagen original: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return input.imageUrl;
    }
  }
}
