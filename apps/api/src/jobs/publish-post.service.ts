import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovalsRepository, PostsRepository, SocialAccountsRepository } from '@cm/db';
import { decryptToken } from '@cm/shared';
import { MetaPublishService } from '../platforms/meta/meta-publish.service';

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
    private readonly metaPublish: MetaPublishService,
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
      if (account.platform !== 'facebook' && account.platform !== 'instagram') {
        throw new Error(`Plataforma no soportada para publicación: ${account.platform}`);
      }

      const accessToken = decryptToken(
        account.access_token_enc,
        this.requireEncryptionKey(),
      );
      const message = this.buildMessage(post.caption, post.hashtags);
      const imageUrl = post.media_assets.find((m) => m.type === 'image')?.storage_url;

      const result = await this.metaPublish.publish({
        platform: account.platform as 'facebook' | 'instagram',
        externalAccountId: account.external_account_id,
        accessToken,
        message,
        imageUrl,
      });

      await this.posts.updateTargetStatus(agencyId, postId, targetId, {
        status: 'published',
        platformPostId: result.platformPostId,
        errorMessage: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(`Fallo publicación destino ${targetId}: ${message}`);

      await this.posts.updateTargetStatus(agencyId, postId, targetId, {
        status: 'failed',
        errorMessage: message,
        incrementAttempts: true,
      });

      throw error;
    }
  }

  buildMessage(caption: string | null, hashtags: string[]): string {
    const parts = [caption?.trim(), hashtags.join(' ')].filter(Boolean);
    return parts.join('\n\n') || '';
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
