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

export type VideoJobStartResult = {
  generationId: string;
  status: 'pending' | 'processing';
};

/** @deprecated usar VideoJobStartResult */
export type AvatarJobStartResult = VideoJobStartResult;

export type AvatarJobStatusResult = {
  generationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: GenerateAvatarFromBriefResult;
};

export type ReelJobStatusResult = {
  generationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: GenerateReelFromBriefResult;
};

type AvatarJobPayload = GenerateAvatarFromBriefInput & {
  userId: string | null;
};

type ReelJobPayload = GenerateReelFromBriefInput & {
  userId: string | null;
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

  async startReelFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateReelFromBriefInput,
  ): Promise<VideoJobStartResult> {
    if (!input.brief?.trim()) {
      throw new PostsValidationError('El brief es obligatorio');
    }
    if (!input.caption?.trim()) {
      throw new PostsValidationError('El caption es obligatorio');
    }
    if (![...new Set(input.socialAccountIds)].length) {
      throw new PostsValidationError('Debe indicar al menos un destino');
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

    const job: ReelJobPayload = { ...input, userId };
    await this.generations.updateStatus(agencyId, videoGen.id, 'processing', {
      output: { job },
    });

    return { generationId: videoGen.id, status: 'processing' };
  }

  async processReelJob(agencyId: string, generationId: string): Promise<void> {
    const gen = await this.generations.findById(agencyId, generationId);
    if (!gen || gen.kind !== 'video') {
      throw new PostsValidationError('Generación de Reel no encontrada');
    }
    if (gen.status === 'completed') return;

    const output = (gen.output ?? {}) as { job?: ReelJobPayload };
    const input = output.job;
    if (!input) {
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: { error: 'Falta el payload del job de Reel' },
      });
      throw new PostsValidationError('Falta el payload del job de Reel');
    }

    const userId = input.userId ?? null;
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
    } catch (error) {
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: {
          error: error instanceof Error ? error.message : 'Error desconocido',
        },
      });
      throw error;
    }

    const uniqueIds = [...new Set(input.socialAccountIds)];
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
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: { error: 'No se pudo crear el post' },
      });
      throw new PostsValidationError('No se pudo crear el post');
    }

    await this.generations.updateStatus(agencyId, generationId, 'completed', {
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
        usedMock: generatedVideo.usedMock,
        postIds: createdPosts.map((p) => p.id),
      },
      mediaId: firstMediaId ?? undefined,
      postId: primary.id,
      model: generatedVideo.model ?? generatedVideo.provider ?? 'video',
    });
    await this.generations.linkPost(agencyId, generationId, primary.id);
  }

  async getReelJobStatus(
    agencyId: string,
    generationId: string,
  ): Promise<ReelJobStatusResult> {
    const gen = await this.generations.findById(agencyId, generationId);
    if (!gen || gen.kind !== 'video') {
      throw new PostsValidationError('Generación de Reel no encontrada');
    }

    if (gen.status === 'pending' || gen.status === 'processing') {
      return { generationId: gen.id, status: gen.status };
    }

    const output = (gen.output ?? {}) as {
      error?: string;
      usedMock?: boolean;
      provider?: GenerateReelFromBriefResult['videoProvider'];
      postIds?: string[];
    };

    if (gen.status === 'failed') {
      return {
        generationId: gen.id,
        status: 'failed',
        error: output.error ?? 'Error al generar el Reel',
      };
    }

    const postIds = output.postIds ?? (gen.post_id ? [gen.post_id] : []);
    const createdPosts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[] =
      [];
    for (const postId of postIds) {
      const post = await this.posts.findById(agencyId, postId);
      if (post) createdPosts.push(post);
    }
    const primary = createdPosts[0];
    if (!primary) {
      return {
        generationId: gen.id,
        status: 'failed',
        error: 'Reel completado pero sin posts asociados',
      };
    }

    const postGenerations = await this.generations.findByPost(agencyId, primary.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, primary.id);

    return {
      generationId: gen.id,
      status: 'completed',
      result: {
        post: primary,
        posts: createdPosts,
        media: postMedia,
        generations: postGenerations,
        usedMock: Boolean(output.usedMock),
        videoProvider: output.provider ?? 'unknown',
        videoModel: gen.model,
      },
    };
  }

  /** Atajo síncrono (tests). En producción: start + cola + polling. */
  async generateReelFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateReelFromBriefInput,
  ): Promise<GenerateReelFromBriefResult> {
    const started = await this.startReelFromBrief(agencyId, userId, input);
    await this.processReelJob(agencyId, started.generationId);
    const status = await this.getReelJobStatus(agencyId, started.generationId);
    if (status.status !== 'completed' || !status.result) {
      throw new PostsValidationError(status.error ?? 'Error al generar el Reel');
    }
    return status.result;
  }

  /**
   * Encola avatar: valida, crea generation y guarda el payload.
   * El worker llama a processAvatarJob; el cliente hace polling con getAvatarJobStatus.
   */
  async startAvatarFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateAvatarFromBriefInput,
  ): Promise<VideoJobStartResult> {
    if (!input.brief?.trim()) {
      throw new PostsValidationError('El brief es obligatorio');
    }
    if (!input.caption?.trim()) {
      throw new PostsValidationError('El caption es obligatorio');
    }
    if (![...new Set(input.socialAccountIds)].length) {
      throw new PostsValidationError('Debe indicar al menos un destino');
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

    const job: AvatarJobPayload = { ...input, userId };
    await this.generations.updateStatus(agencyId, videoGen.id, 'processing', {
      output: { job },
    });

    return { generationId: videoGen.id, status: 'processing' };
  }

  async processAvatarJob(agencyId: string, generationId: string): Promise<void> {
    const gen = await this.generations.findById(agencyId, generationId);
    if (!gen || gen.kind !== 'avatar_video') {
      throw new PostsValidationError('Generación de avatar no encontrada');
    }
    if (gen.status === 'completed') return;

    const output = (gen.output ?? {}) as { job?: AvatarJobPayload; error?: string };
    const input = output.job;
    if (!input) {
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: { error: 'Falta el payload del job de avatar' },
      });
      throw new PostsValidationError('Falta el payload del job de avatar');
    }

    const userId = input.userId ?? null;
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
    } catch (error) {
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: {
          error: error instanceof Error ? error.message : 'Error desconocido',
        },
      });
      throw error;
    }

    const uniqueIds = [...new Set(input.socialAccountIds)];
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
      await this.generations.updateStatus(agencyId, generationId, 'failed', {
        output: { error: 'No se pudo crear el post' },
      });
      throw new PostsValidationError('No se pudo crear el post');
    }

    await this.generations.updateStatus(agencyId, generationId, 'completed', {
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
        usedMock: generated.usedMock,
        postIds: createdPosts.map((p) => p.id),
      },
      mediaId: firstMediaId ?? undefined,
      postId: primary.id,
      model: generated.model,
    });
    await this.generations.linkPost(agencyId, generationId, primary.id);
  }

  async getAvatarJobStatus(
    agencyId: string,
    generationId: string,
  ): Promise<AvatarJobStatusResult> {
    const gen = await this.generations.findById(agencyId, generationId);
    if (!gen || gen.kind !== 'avatar_video') {
      throw new PostsValidationError('Generación de avatar no encontrada');
    }

    if (gen.status === 'pending' || gen.status === 'processing') {
      return { generationId: gen.id, status: gen.status };
    }

    const output = (gen.output ?? {}) as {
      error?: string;
      usedMock?: boolean;
      ttsProvider?: GenerateAvatarFromBriefResult['ttsProvider'];
      lipsyncProvider?: GenerateAvatarFromBriefResult['lipsyncProvider'];
      postIds?: string[];
    };

    if (gen.status === 'failed') {
      return {
        generationId: gen.id,
        status: 'failed',
        error: output.error ?? 'Error al generar el avatar',
      };
    }

    const postIds = output.postIds ?? (gen.post_id ? [gen.post_id] : []);
    const createdPosts: NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>[] =
      [];
    for (const postId of postIds) {
      const post = await this.posts.findById(agencyId, postId);
      if (post) createdPosts.push(post);
    }
    const primary = createdPosts[0];
    if (!primary) {
      return {
        generationId: gen.id,
        status: 'failed',
        error: 'Avatar completado pero sin posts asociados',
      };
    }

    const postGenerations = await this.generations.findByPost(agencyId, primary.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, primary.id);

    return {
      generationId: gen.id,
      status: 'completed',
      result: {
        post: primary,
        posts: createdPosts,
        media: postMedia,
        generations: postGenerations,
        usedMock: Boolean(output.usedMock),
        ttsProvider: output.ttsProvider ?? 'unknown',
        lipsyncProvider: output.lipsyncProvider ?? 'unknown',
        videoModel: gen.model,
      },
    };
  }

  /** Atajo síncrono (tests / local). En producción usar start + cola + polling. */
  async generateAvatarFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateAvatarFromBriefInput,
  ): Promise<GenerateAvatarFromBriefResult> {
    const started = await this.startAvatarFromBrief(agencyId, userId, input);
    await this.processAvatarJob(agencyId, started.generationId);
    const status = await this.getAvatarJobStatus(agencyId, started.generationId);
    if (status.status !== 'completed' || !status.result) {
      throw new PostsValidationError(status.error ?? 'Error al generar el avatar');
    }
    return status.result;
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
