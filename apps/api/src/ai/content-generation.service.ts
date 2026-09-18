import { Inject, Injectable } from '@nestjs/common';
import {
  ApprovalsRepository,
  GenerationsRepository,
  MediaAssetsRepository,
  PostsRepository,
  PostsValidationError,
  SocialAccountsRepository,
} from '@cm/db';
import {
  imageSizeForPresets,
  presetsForPlatforms,
} from './platform-visual-presets';
import { IMAGE_PROVIDER, VIDEO_PROVIDER } from './ai.tokens';
import type { ImageProvider } from './interfaces/image-provider.interface';
import type { VideoProvider } from './interfaces/video-provider.interface';

export type GenerateFromBriefInput = {
  clientId: string;
  brief: string;
  caption: string;
  hashtags?: string[];
  socialAccountIds: string[];
  referenceText?: string;
  videoFormat?: 'feed' | 'reel' | null;
  placeId?: string | null;
  placeName?: string | null;
};

export type GenerateReelFromBriefInput = GenerateFromBriefInput & {
  /** URL pública de foto de referencia (image-to-video). */
  referenceImageUrl?: string;
};

export type GenerateFromBriefResult = {
  /** Primer post (compatibilidad con clientes que esperan un solo post). */
  post: Awaited<ReturnType<PostsRepository['findById']>>;
  /** Un post por cuenta destino (alineado a Radar / Composer). */
  posts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[];
  media: Awaited<ReturnType<MediaAssetsRepository['findByPost']>>;
  generations: Awaited<ReturnType<GenerationsRepository['findByPost']>>;
  /** true si se usó picsum mock (sin IMAGE_API_KEY de OpenAI). */
  usedMock: boolean;
  imageProvider: 'openai' | 'mock' | 'unknown';
  imageModel: string | null;
};

export type GenerateReelFromBriefResult = {
  post: Awaited<ReturnType<PostsRepository['findById']>>;
  posts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[];
  media: Awaited<ReturnType<MediaAssetsRepository['findByPost']>>;
  generations: Awaited<ReturnType<GenerationsRepository['findByPost']>>;
  usedMock: boolean;
  videoProvider: 'fal' | 'mock' | 'unknown';
  videoModel: string | null;
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
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
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

    const accounts = await this.socialAccounts.findByAgency(agencyId, input.clientId);
    const selectedPlatforms = accounts
      .filter((a) => input.socialAccountIds.includes(a.id))
      .map((a) => a.platform);
    const platformPresets = presetsForPlatforms(selectedPlatforms, input.videoFormat);
    const imageSize = imageSizeForPresets(platformPresets);

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
        referenceText: input.referenceText,
        platformPresets,
        imageSize,
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

    const uniqueIds = [...new Set(input.socialAccountIds)];
    if (!uniqueIds.length) {
      throw new PostsValidationError('Debe indicar al menos un destino');
    }

    const createdPosts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[] =
      [];
    let firstMediaId: string | null = null;

    for (const accountId of uniqueIds) {
      const post = await this.posts.create(
        agencyId,
        userId,
        {
          clientId: input.clientId,
          caption: input.caption.trim(),
          hashtags: input.hashtags ?? [],
          socialAccountIds: [accountId],
          videoFormat: input.videoFormat ?? null,
          placeId: input.placeId ?? null,
          placeName: input.placeName ?? null,
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
      if (!firstMediaId) firstMediaId = media.id;

      const fullPost = await this.posts.findById(agencyId, post.id);
      if (fullPost) createdPosts.push(fullPost);
    }

    const primary = createdPosts[0];
    if (!primary) {
      throw new PostsValidationError('No se pudo crear el post');
    }

    await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
      output: {
        imageUrl: generatedImage.url,
        provider: generatedImage.provider ?? 'unknown',
        width: generatedImage.width,
        height: generatedImage.height,
        postIds: createdPosts.map((p) => p.id),
      },
      mediaId: firstMediaId ?? undefined,
      postId: primary.id,
      model: generatedImage.model ?? generatedImage.provider ?? 'image',
    });
    await this.generations.linkPost(agencyId, imageGen.id, primary.id);

    const postGenerations = await this.generations.findByPost(agencyId, primary.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, primary.id);

    return {
      post: primary,
      posts: createdPosts,
      media: postMedia,
      generations: postGenerations,
      usedMock: generatedImage.provider === 'mock',
      imageProvider: generatedImage.provider ?? 'unknown',
      imageModel: generatedImage.model ?? null,
    };
  }

  async generateReelFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateReelFromBriefInput,
  ): Promise<GenerateReelFromBriefResult> {
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

    const videoGen = await this.generations.create(agencyId, {
      kind: 'video',
      prompt: input.brief,
      model: 'pending-video',
    });
    await this.generations.updateStatus(agencyId, videoGen.id, 'processing');

    let generatedVideo;
    try {
      generatedVideo = await this.video.generateVideo({
        prompt: input.brief.trim(),
        caption: input.caption,
        hashtags: input.hashtags,
        referenceText: input.referenceText,
        referenceImageUrl: input.referenceImageUrl,
        agencyId,
      });
      await this.generations.updateStatus(agencyId, videoGen.id, 'completed', {
        output: {
          videoUrl: generatedVideo.url,
          provider: generatedVideo.provider ?? 'unknown',
          width: generatedVideo.width,
          height: generatedVideo.height,
        },
        model: generatedVideo.model ?? generatedVideo.provider ?? 'video',
      });
    } catch (error) {
      await this.generations.updateStatus(agencyId, videoGen.id, 'failed', {
        output: { error: error instanceof Error ? error.message : 'Error desconocido' },
      });
      throw error;
    }

    const uniqueIds = [...new Set(input.socialAccountIds)];
    if (!uniqueIds.length) {
      throw new PostsValidationError('Debe indicar al menos un destino');
    }

    const createdPosts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[] =
      [];
    let firstMediaId: string | null = null;

    for (const accountId of uniqueIds) {
      const post = await this.posts.create(
        agencyId,
        userId,
        {
          clientId: input.clientId,
          caption: input.caption.trim(),
          hashtags: input.hashtags ?? [],
          socialAccountIds: [accountId],
          videoFormat: 'reel',
          placeId: input.placeId ?? null,
          placeName: input.placeName ?? null,
        },
        'pending_approval',
      );

      await this.approvals.createPending(post.id);

      const media = await this.mediaAssets.create(agencyId, {
        postId: post.id,
        type: 'video',
        source: 'ai_generated',
        storageUrl: generatedVideo.url,
        width: generatedVideo.width,
        height: generatedVideo.height,
      });
      if (!firstMediaId) firstMediaId = media.id;

      const fullPost = await this.posts.findById(agencyId, post.id);
      if (fullPost) createdPosts.push(fullPost);
    }

    const primary = createdPosts[0];
    if (!primary) {
      throw new PostsValidationError('No se pudo crear el post');
    }

    await this.generations.updateStatus(agencyId, videoGen.id, 'completed', {
      output: {
        videoUrl: generatedVideo.url,
        provider: generatedVideo.provider ?? 'unknown',
        width: generatedVideo.width,
        height: generatedVideo.height,
        postIds: createdPosts.map((p) => p.id),
      },
      mediaId: firstMediaId ?? undefined,
      postId: primary.id,
      model: generatedVideo.model ?? generatedVideo.provider ?? 'video',
    });
    await this.generations.linkPost(agencyId, videoGen.id, primary.id);

    const postGenerations = await this.generations.findByPost(agencyId, primary.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, primary.id);

    return {
      post: primary,
      posts: createdPosts,
      media: postMedia,
      generations: postGenerations,
      usedMock: generatedVideo.provider === 'mock',
      videoProvider: generatedVideo.provider ?? 'unknown',
      videoModel: generatedVideo.model ?? null,
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
