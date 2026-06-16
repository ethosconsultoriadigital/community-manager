import { Injectable } from '@nestjs/common';
import {
  ApprovalsRepository,
  MediaAssetsRepository,
  PostsRepository,
  SourceItemsRepository,
  SourceItemsValidationError,
} from '@cm/db';

export type PromoteItemInput = {
  socialAccountIds: string[];
};

@Injectable()
export class PromoteItemService {
  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly posts: PostsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly approvals: ApprovalsRepository,
  ) {}

  async promote(
    agencyId: string,
    userId: string | null,
    itemId: string,
    input: PromoteItemInput,
  ) {
    const item = await this.sourceItems.findById(agencyId, itemId);
    if (!item) return null;

    if (item.status !== 'approved') {
      throw new SourceItemsValidationError('El item debe estar aprobado antes de promoverlo');
    }
    if (item.post_id) {
      throw new SourceItemsValidationError('El item ya fue promovido a un post');
    }

    const caption =
      item.copy_facebook?.trim() ||
      item.copy_instagram?.trim() ||
      [item.title, item.summary].filter(Boolean).join('\n\n');

    const post = await this.posts.create(
      agencyId,
      userId,
      {
        clientId: item.client_id,
        caption,
        hashtags: item.hashtags,
        socialAccountIds: input.socialAccountIds,
        contentSourceId: item.source_id,
      },
      'pending_approval',
    );

    if (item.image_url) {
      await this.mediaAssets.create(agencyId, {
        postId: post.id,
        type: 'image',
        source: 'upload',
        storageUrl: item.image_url,
      });
    }

    await this.approvals.createPending(post.id);
    await this.sourceItems.linkPost(agencyId, itemId, post.id);

    return {
      item: await this.sourceItems.findById(agencyId, itemId),
      post: await this.posts.findById(agencyId, post.id),
    };
  }
}
