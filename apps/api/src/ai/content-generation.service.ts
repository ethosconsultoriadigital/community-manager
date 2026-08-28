import { Inject, Injectable } from '@nestjs/common';
import {
  ApprovalsRepository,
  GenerationsRepository,
  MediaAssetsRepository,
  PostsRepository,
  PostsValidationError,
  SocialAccountsRepository,
} from '@cm/db';
import { IMAGE_PROVIDER } from './ai.tokens';
import type { ImageProvider } from './interfaces/image-provider.interface';

export type GenerateFromBriefInput = {
  clientId: string;
  brief: string;
  caption: string;
  hashtags?: string[];
  socialAccountIds: string[];
};

export type GenerateFromBriefResult = {
  post: Awaited<ReturnType<PostsRepository['findById']>>;
  media: Awaited<ReturnType<MediaAssetsRepository['findByPost']>>;
  generations: Awaited<ReturnType<GenerationsRepository['findByPost']>>;
  /** true si se usó picsum mock (sin IMAGE_API_KEY de OpenAI). */
  usedMock: boolean;
  imageProvider: 'openai' | 'mock' | 'unknown';
  imageModel: string | null;
};

@Injectable()
export class ContentGenerationService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly generations: GenerationsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    @Inject(IMAGE_PROVIDER) private readonly image: ImageProvider,
  ) {}

  async generateFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateFromBriefInput,
  ): Promise<GenerateFromBriefResult> {
    if (!input.brief?.trim()) {
      throw new PostsValidationError('El brief es obligatorio');
    }
    if (!input.caption?.trim()) {
      throw new PostsValidationError('El caption es obligatorio');
    }

    await this.assertSocialAccountsActive(
      agencyId,
      input.clientId,
      input.socialAccountIds,
    );

    const imageGen = await this.generations.create(agencyId, {
      kind: 'image',
      prompt: input.brief,
      model: 'pending-image',
    });
    await this.generations.updateStatus(agencyId, imageGen.id, 'processing');

    let generatedImage;
    try {
      generatedImage = await this.image.generateImage({
        brief: input.brief,
        caption: input.caption,
        hashtags: input.hashtags,
        agencyId,
      });
      await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
        output: {
          imageUrl: generatedImage.url,
          provider: generatedImage.provider ?? 'unknown',
          width: generatedImage.width,
          height: generatedImage.height,
        },
        model: generatedImage.model ?? generatedImage.provider ?? 'image',
      });
    } catch (error) {
      await this.generations.updateStatus(agencyId, imageGen.id, 'failed', {
        output: { error: error instanceof Error ? error.message : 'Error desconocido' },
      });
      throw error;
    }

    const post = await this.posts.create(
      agencyId,
      userId,
      {
        clientId: input.clientId,
        caption: input.caption.trim(),
        hashtags: input.hashtags ?? [],
        socialAccountIds: input.socialAccountIds,
      },
      'pending_approval',
    );

    await this.approvals.createPending(post.id);

    const media = await this.mediaAssets.create(agencyId, {
      postId: post.id,
      type: 'image',
      source: 'ai_generated',
      storageUrl: generatedImage.url,
      width: generatedImage.width,
      height: generatedImage.height,
    });

    await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
      output: {
        imageUrl: generatedImage.url,
        provider: generatedImage.provider ?? 'unknown',
        width: generatedImage.width,
        height: generatedImage.height,
      },
      mediaId: media.id,
      postId: post.id,
      model: generatedImage.model ?? generatedImage.provider ?? 'image',
    });
    await this.generations.linkPost(agencyId, imageGen.id, post.id);

    const fullPost = await this.posts.findById(agencyId, post.id);
    const postGenerations = await this.generations.findByPost(agencyId, post.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, post.id);

    return {
      post: fullPost,
      media: postMedia,
      generations: postGenerations,
      usedMock: generatedImage.provider === 'mock',
      imageProvider: generatedImage.provider ?? 'unknown',
      imageModel: generatedImage.model ?? null,
    };
  }

  private async assertSocialAccountsActive(
    agencyId: string,
    clientId: string,
    socialAccountIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(socialAccountIds)];
    const accounts = await this.socialAccounts.findByAgency(agencyId, clientId);
    const selected = accounts.filter(
      (account) => uniqueIds.includes(account.id) && account.is_active,
    );

    if (selected.length !== uniqueIds.length) {
      throw new PostsValidationError(
        'Uno o más destinos no pertenecen al cliente o no están activos',
      );
    }
  }
}
