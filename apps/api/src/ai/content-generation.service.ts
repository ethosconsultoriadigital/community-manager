import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApprovalsRepository,
  ClientsRepository,
  GenerationsRepository,
  MediaAssetsRepository,
  PostsRepository,
  PostsValidationError,
  SocialAccountsRepository,
} from '@cm/db';
import { MediaStorageService } from '../media/media-storage.service';
import {
  imageSizeForPresets,
  presetsForPlatforms,
} from './platform-visual-presets';
import { IMAGE_PROVIDER } from './ai.tokens';
import type { ImageProvider } from './interfaces/image-provider.interface';
import { CompositionService } from './composition/composition.service';
import { DEFAULT_LAYOUT_KEY, parseClientBrand } from './composition/brand-layout';
import { ReelPipelineService } from './reel-pipeline.service';
import { AvatarPipelineService } from './avatar-pipeline.service';

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
  /**
   * URL del logo de marca (activo). Nunca se envía a OpenAI; solo a CompositionService.
   * Si se omite, se usa clients.brand.logoUrl cuando composeWithBrand es true.
   */
  composeLogoUrl?: string;
  /** Si true, compone logo/texto de marca sobre el fondo generado. */
  composeWithBrand?: boolean;
  layoutKey?: string;
  composeFields?: Record<string, string>;
};

export type GenerateReelFromBriefInput = GenerateFromBriefInput & {
  /** URL pública de foto de referencia (image-to-video / keyframe escena 1). */
  referenceImageUrl?: string;
  /** Escenas del Reel multi-clip (2–4). */
  sceneCount?: number;
  /** Duración objetivo (s); se traduce en nº de escenas si no hay sceneCount. */
  targetDurationSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
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

export type GenerateAvatarFromBriefInput = {
  clientId: string;
  brief: string;
  caption: string;
  hashtags?: string[];
  socialAccountIds: string[];
  referenceText?: string;
  characterImageUrl?: string;
  voiceId?: string;
  targetSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
  placeId?: string | null;
  placeName?: string | null;
};

export type GenerateAvatarFromBriefResult = {
  post: Awaited<ReturnType<PostsRepository['findById']>>;
  posts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[];
  media: Awaited<ReturnType<MediaAssetsRepository['findByPost']>>;
  generations: Awaited<ReturnType<GenerationsRepository['findByPost']>>;
  usedMock: boolean;
  ttsProvider: 'elevenlabs' | 'mock' | 'unknown';
  lipsyncProvider: 'fal' | 'mock' | 'unknown';
  videoModel: string | null;
};

@Injectable()
export class ContentGenerationService {
  private readonly logger = new Logger(ContentGenerationService.name);

  constructor(
    private readonly posts: PostsRepository,
    private readonly generations: GenerationsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clients: ClientsRepository,
    private readonly mediaStorage: MediaStorageService,
    private readonly composition: CompositionService,
    private readonly reelPipeline: ReelPipelineService,
    private readonly avatarPipeline: AvatarPipelineService,
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
    let composed = false;
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

      const composedImage = await this.maybeComposeBrand(
        agencyId,
        input,
        generatedImage,
      );
      if (composedImage) {
        generatedImage = composedImage;
        composed = true;
      }

      await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
        output: {
          imageUrl: generatedImage.url,
          provider: generatedImage.provider ?? 'unknown',
          width: generatedImage.width,
          height: generatedImage.height,
          composed,
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
        composed,
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

  /**
   * Post-proceso: logo/texto por código. Solo si hay logo (request o brand).
   * El ImageProvider no recibe el logo.
   */
  private async maybeComposeBrand(
    agencyId: string,
    input: GenerateFromBriefInput,
    generatedImage: {
      url: string;
      width: number;
      height: number;
      model?: string;
      provider?: 'openai' | 'mock';
    },
  ) {
    const client = await this.clients.findById(agencyId, input.clientId);
    const brand = parseClientBrand(client?.brand);
    const logoUrl =
      input.composeLogoUrl?.trim() ||
      (input.composeWithBrand ? brand.logoUrl : undefined) ||
      undefined;

    if (!logoUrl) return null;

    const fields: Record<string, string> = {
      ...(input.composeFields ?? {}),
    };
    if (!fields.title?.trim()) {
      fields.title = input.caption.trim().slice(0, 120);
    }

    const composed = await this.composition.compose({
      background: generatedImage.url,
      agencyId,
      clientId: input.clientId,
      layoutKey: input.layoutKey?.trim() || DEFAULT_LAYOUT_KEY,
      fields,
      logoUrl,
    });
    const stored = await this.mediaStorage.save({
      agencyId,
      buffer: composed.buffer,
      extension: 'png',
      contentType: 'image/png',
    });
    this.logger.log(
      `Imagen compuesta con logo de marca (${composed.width}x${composed.height})`,
    );
    return {
      ...generatedImage,
      url: stored.storageUrl,
      width: composed.width,
      height: composed.height,
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
      generatedVideo = await this.reelPipeline.generate({
        agencyId,
        brief: input.brief.trim(),
        caption: input.caption,
        hashtags: input.hashtags,
        referenceText: input.referenceText,
        referenceImageUrl: input.referenceImageUrl,
        sceneCount: input.sceneCount,
        targetDurationSeconds: input.targetDurationSeconds,
        musicTrackId: input.musicTrackId,
        withMusic: input.withMusic,
        withSubtitles: input.withSubtitles,
      });
      await this.generations.updateStatus(agencyId, videoGen.id, 'completed', {
        output: {
          videoUrl: generatedVideo.url,
          provider: generatedVideo.provider ?? 'unknown',
          width: generatedVideo.width,
          height: generatedVideo.height,
          multiScene: generatedVideo.multiScene,
          sceneCount: generatedVideo.sceneCount,
          musicSuggestion: generatedVideo.musicSuggestion,
          musicTrackId: generatedVideo.musicTrackId,
          burnedSubtitles: generatedVideo.burnedSubtitles,
          durationSeconds: generatedVideo.durationSeconds,
          sceneModels: generatedVideo.sceneModels,
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
        multiScene: generatedVideo.multiScene,
        sceneCount: generatedVideo.sceneCount,
        musicSuggestion: generatedVideo.musicSuggestion,
        musicTrackId: generatedVideo.musicTrackId,
        burnedSubtitles: generatedVideo.burnedSubtitles,
        durationSeconds: generatedVideo.durationSeconds,
        sceneModels: generatedVideo.sceneModels,
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
      usedMock: generatedVideo.usedMock,
      videoProvider: generatedVideo.provider ?? 'unknown',
      videoModel: generatedVideo.model ?? null,
    };
  }

  async generateAvatarFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateAvatarFromBriefInput,
  ): Promise<GenerateAvatarFromBriefResult> {
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
      kind: 'avatar_video',
      prompt: input.brief,
      model: 'pending-avatar',
    });
    await this.generations.updateStatus(agencyId, videoGen.id, 'processing');

    let generated;
    try {
      generated = await this.avatarPipeline.generate({
        agencyId,
        clientId: input.clientId,
        brief: input.brief.trim(),
        caption: input.caption,
        referenceText: input.referenceText,
        characterImageUrl: input.characterImageUrl,
        voiceId: input.voiceId,
        targetSeconds: input.targetSeconds,
        musicTrackId: input.musicTrackId,
        withMusic: input.withMusic,
        withSubtitles: input.withSubtitles,
      });
      await this.generations.updateStatus(agencyId, videoGen.id, 'completed', {
        output: {
          videoUrl: generated.url,
          ttsProvider: generated.ttsProvider,
          lipsyncProvider: generated.lipsyncProvider,
          width: generated.width,
          height: generated.height,
          musicTrackId: generated.musicTrackId,
          burnedSubtitles: generated.burnedSubtitles,
          durationSeconds: generated.durationSeconds,
          spokenTextPreview: generated.spokenTextPreview,
        },
        model: generated.model,
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
        storageUrl: generated.url,
        width: generated.width,
        height: generated.height,
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
        videoUrl: generated.url,
        ttsProvider: generated.ttsProvider,
        lipsyncProvider: generated.lipsyncProvider,
        width: generated.width,
        height: generated.height,
        musicTrackId: generated.musicTrackId,
        burnedSubtitles: generated.burnedSubtitles,
        durationSeconds: generated.durationSeconds,
        spokenTextPreview: generated.spokenTextPreview,
        postIds: createdPosts.map((p) => p.id),
      },
      mediaId: firstMediaId ?? undefined,
      postId: primary.id,
      model: generated.model,
    });
    await this.generations.linkPost(agencyId, videoGen.id, primary.id);

    const postGenerations = await this.generations.findByPost(agencyId, primary.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, primary.id);

    return {
      post: primary,
      posts: createdPosts,
      media: postMedia,
      generations: postGenerations,
      usedMock: generated.usedMock,
      ttsProvider: generated.ttsProvider,
      lipsyncProvider: generated.lipsyncProvider,
      videoModel: generated.model,
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
