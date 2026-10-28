import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalsRepository, PostsRepository, SocialAccountsRepository } from '@cm/db';
import { buildPublishMessage, decryptToken } from '@cm/shared';
import { AabSheetWriteBackService } from '../content-sources/aab-sheet-writeback.service';
import { PlatformPublisherRegistry } from '../platforms/platform-publisher.registry';
import {
  AAB_NO_STORY_IMAGE_MESSAGE,
  isSuppliedStoryAsset,
  stripHtmlTags,
} from '../platforms/meta/story-asset';
import type { PublishPlatform } from '../platforms/platform-publisher.interface';

export type PublishPostJobData = {
  agencyId: string;
  postId: string;
  targetId?: string;
};

@Injectable()
export class PublishPostService {
  private readonly logger = new Logger(PublishPostService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly posts: PostsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly publishers: PlatformPublisherRegistry,
    private readonly aabWriteBack: AabSheetWriteBackService,
  ) {}

  async publishPost(data: PublishPostJobData): Promise<void> {
    const { agencyId, postId, targetId } = data;
    const post = await this.posts.findForPublish(agencyId, postId);
    if (!post) {
      this.logger.warn(`Post ${postId} no encontrado para agencia ${agencyId}`);
      return;
    }

    if (!post.approvals.length) {
      this.logger.warn(`Post ${postId} sin aprobación; no se publica`);
      return;
    }

    if (!['scheduled', 'publishing'].includes(post.status)) {
      this.logger.warn(`Post ${postId} en estado ${post.status}; se omite`);
      return;
    }

    await this.posts.markPublishing(agencyId, postId);

    const targets = targetId
      ? post.post_targets.filter((t) => t.id === targetId)
      : post.post_targets.filter((t) => t.status === 'pending' || t.status === 'failed');

    for (const target of targets) {
      if (target.status === 'published') continue;
      await this.publishTarget(agencyId, postId, target.id, post);
    }

    await this.posts.refreshAggregateStatus(agencyId, postId);
    try {
      await this.aabWriteBack.notifyFromPost(agencyId, postId);
    } catch (err) {
      this.logger.warn(
        `Write-back AAB tras publicar ${postId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async publishTarget(
    agencyId: string,
    postId: string,
    targetId: string,
    post: NonNullable<Awaited<ReturnType<PostsRepository['findForPublish']>>>,
  ) {
    const target = post.post_targets.find((t) => t.id === targetId);
    if (!target) return;

    await this.posts.updateTargetStatus(agencyId, postId, targetId, {
      status: 'publishing',
    });

    try {
      const account = await this.socialAccounts.findByIdWithToken(
        agencyId,
        target.social_account_id,
      );
      if (!account?.is_active) {
        throw new Error('Cuenta social inactiva o no encontrada');
      }

      const publisher = this.publishers.getPublisher(account.platform);
      const accessToken = decryptToken(
        account.access_token_enc,
        this.requireEncryptionKey(),
      );
      const isAab = await this.aabWriteBack.isAabPost(agencyId, postId);
      const rawMessage = this.buildMessage(post.caption, post.hashtags);
      const message = isAab ? stripHtmlTags(rawMessage) : rawMessage;
      const feedAssets = post.media_assets.filter((asset) => !isSuppliedStoryAsset(asset));
      const storyAsset = post.media_assets.find((asset) => isSuppliedStoryAsset(asset));
      // AAB: la historia solo usa url_portada_historia. Sin ella no hay historia, aunque pidan "+ Story".
      const requestedStory = Boolean(post.also_publish_as_story);
      const aabStoryBlocked = isAab && requestedStory && !storyAsset?.storage_url;
      const imageAssets = feedAssets.filter((m) => m.type === 'image');
      const primaryMedia = feedAssets[0];
      const imageUrl = primaryMedia?.type === 'image' ? primaryMedia.storage_url : undefined;
      const imageUrls = imageAssets
        .slice(0, 4)
        .map((m) => m.storage_url)
        .filter(Boolean);
      const videoAsset =
        account.platform === 'tiktok'
          ? post.media_assets.find((m) => m.type === 'video')
          : primaryMedia?.type === 'video'
            ? primaryMedia
            : undefined;
      const videoUrl = videoAsset?.storage_url;
      const videoFormat =
        post.video_format === 'reel' ? ('reel' as const) : ('feed' as const);

      if (videoFormat === 'reel' && !videoUrl && account.platform === 'instagram') {
        throw new Error('Publicar como Reel requiere un video adjunto');
      }

      const result = await publisher.publish({
        platform: account.platform as PublishPlatform,
        externalAccountId: account.external_account_id,
        accessToken,
        agencyId,
        postId,
        message,
        imageUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        storyImageUrl: storyAsset?.storage_url,
        videoUrl,
        videoFormat: videoUrl ? videoFormat : undefined,
        alsoPublishAsStory: requestedStory && !aabStoryBlocked,
        placeId: post.place_id ?? undefined,
      });

      await this.posts.updateTargetStatus(agencyId, postId, targetId, {
        status: 'published',
        platformPostId: result.platformPostId,
        errorMessage: null,
        storyPlatformPostId: result.storyPlatformPostId ?? null,
        storyStatus: aabStoryBlocked ? 'skipped' : (result.storyStatus ?? null),
        storyErrorMessage: aabStoryBlocked
          ? AAB_NO_STORY_IMAGE_MESSAGE
          : (result.storyErrorMessage ?? null),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(`Fallo publicación destino ${targetId}: ${message}`);

      await this.posts.updateTargetStatus(agencyId, postId, targetId, {
        status: 'failed',
        errorMessage: message,
        incrementAttempts: true,
      });
    }
  }

  buildMessage(caption: string | null, hashtags: string[]): string {
    return buildPublishMessage(caption, hashtags);
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
