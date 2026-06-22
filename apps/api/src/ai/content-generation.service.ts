import { Inject, Injectable } from '@nestjs/common';
import {
  ApprovalsRepository,
  GenerationsRepository,
  MediaAssetsRepository,
  PostsRepository,
  PostsValidationError,
  SocialAccountsRepository,
} from '@cm/db';
import { CANVA_PROVIDER, IMAGE_PROVIDER, LLM_PROVIDER } from './ai.tokens';
import type { CanvaProvider } from './interfaces/canva-provider.interface';
import type { ImageProvider } from './interfaces/image-provider.interface';
import type { LlmProvider } from './interfaces/llm-provider.interface';

export type GenerateFromBriefInput = {
  clientId: string;
  brief: string;
  socialAccountIds: string[];
};

export type GenerateFromBriefResult = {
  post: Awaited<ReturnType<PostsRepository['findById']>>;
  media: Awaited<ReturnType<MediaAssetsRepository['findByPost']>>;
  generations: Awaited<ReturnType<GenerationsRepository['findByPost']>>;
};

@Injectable()
export class ContentGenerationService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly generations: GenerationsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(IMAGE_PROVIDER) private readonly image: ImageProvider,
    @Inject(CANVA_PROVIDER) private readonly canva: CanvaProvider,
  ) {}

  async generateFromBrief(
    agencyId: string,
    userId: string | null,
    input: GenerateFromBriefInput,
  ): Promise<GenerateFromBriefResult> {
    if (!input.brief?.trim()) {
      throw new PostsValidationError('El brief es obligatorio');
    }

    const platforms = await this.resolvePlatforms(
      agencyId,
      input.clientId,
      input.socialAccountIds,
    );

    const copyGen = await this.generations.create(agencyId, {
      kind: 'copy',
      prompt: input.brief,
      model: 'mock-llm',
    });
    await this.generations.updateStatus(agencyId, copyGen.id, 'processing');

    let copyOutput;
    try {
      copyOutput = await this.llm.generateCopy({
        brief: input.brief,
        platforms,
      });
      await this.generations.updateStatus(agencyId, copyGen.id, 'completed', {
        output: copyOutput,
        model: 'mock-llm',
      });
    } catch (error) {
      await this.generations.updateStatus(agencyId, copyGen.id, 'failed', {
        output: { error: error instanceof Error ? error.message : 'Error desconocido' },
      });
      throw error;
    }

    const imageGen = await this.generations.create(agencyId, {
      kind: 'image',
      prompt: input.brief,
      model: 'mock-image',
    });
    await this.generations.updateStatus(agencyId, imageGen.id, 'processing');

    let rawImage;
    let canvaExport;
    try {
      rawImage = await this.image.generateImage({ brief: input.brief });
      canvaExport = await this.canva.composeFlyer({
        brief: input.brief,
        imageUrl: rawImage.url,
        agencyId,
        clientId: input.clientId,
      });
      const canvaModel =
        canvaExport.provider === 'canva-connect' ? 'canva-connect' : 'mock-canva';
      await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
        output: {
          rawImageUrl: rawImage.url,
          canvaUrl: canvaExport.url,
          templateId: canvaExport.templateId,
          provider: canvaExport.provider ?? 'mock',
          designId: canvaExport.designId,
        },
        model: canvaModel,
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
        caption: copyOutput.caption,
        hashtags: copyOutput.hashtags,
        socialAccountIds: input.socialAccountIds,
      },
      'pending_approval',
    );

    await this.approvals.createPending(post.id);

    const media = await this.mediaAssets.create(agencyId, {
      postId: post.id,
      type: 'image',
      source: 'canva',
      storageUrl: canvaExport.url,
      width: rawImage.width,
      height: rawImage.height,
    });

    await this.generations.updateStatus(agencyId, imageGen.id, 'completed', {
      output: {
        rawImageUrl: rawImage.url,
        canvaUrl: canvaExport.url,
        templateId: canvaExport.templateId,
        provider: canvaExport.provider ?? 'mock',
        designId: canvaExport.designId,
      },
      mediaId: media.id,
      postId: post.id,
      model: canvaExport.provider === 'canva-connect' ? 'canva-connect' : 'mock-canva',
    });
    await this.generations.linkPost(agencyId, copyGen.id, post.id);

    const fullPost = await this.posts.findById(agencyId, post.id);
    const postGenerations = await this.generations.findByPost(agencyId, post.id);
    const postMedia = await this.mediaAssets.findByPost(agencyId, post.id);

    return {
      post: fullPost,
      media: postMedia,
      generations: postGenerations,
    };
  }

  private async resolvePlatforms(
    agencyId: string,
    clientId: string,
    socialAccountIds: string[],
  ): Promise<string[]> {
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

    return [...new Set(selected.map((account) => account.platform))];
  }
}
