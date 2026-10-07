import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  BadRequestException,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PostsValidationError } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { ContentGenerationService } from '../ai/content-generation.service';
import { ReferenceMaterialService } from '../ai/reference-material.service';
import { LLM_PROVIDER } from '../ai/ai.tokens';
import type { LlmProvider } from '../ai/interfaces/llm-provider.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AvatarGenerationQueueService } from '../jobs/avatar-generation-queue.service';
import { ReelGenerationQueueService } from '../jobs/reel-generation-queue.service';

class GenerateFromBriefDto {
  clientId!: string;
  brief!: string;
  caption!: string;
  hashtags?: string[];
  socialAccountIds!: string[];
  referenceText?: string;
  videoFormat?: 'feed' | 'reel' | null;
  placeId?: string | null;
  placeName?: string | null;
  /** Logo de marca (URL). No se envía a OpenAI; solo composición sharp. */
  composeLogoUrl?: string;
  composeWithBrand?: boolean;
  layoutKey?: string;
  composeFields?: Record<string, string>;
}

class GenerateReelFromBriefDto {
  clientId!: string;
  brief!: string;
  caption!: string;
  hashtags?: string[];
  socialAccountIds!: string[];
  referenceText?: string;
  /** URL pública de foto para image-to-video (biblioteca o /media/upload). */
  referenceImageUrl?: string;
  /** Escenas multi-clip (2–4). Por defecto REEL_SCENE_COUNT o 2. */
  sceneCount?: number;
  /** Duración objetivo en segundos (~10 / 15 / 20). */
  targetDurationSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
  placeId?: string | null;
  placeName?: string | null;
}

class GenerateAvatarFromBriefDto {
  clientId!: string;
  brief!: string;
  caption!: string;
  hashtags?: string[];
  socialAccountIds!: string[];
  referenceText?: string;
  characterImageUrl?: string;
  voiceId?: string;
  targetSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
  placeId?: string | null;
  placeName?: string | null;
}

class GenerateCopyDto {
  brief!: string;
  platforms?: string[];
  clientId?: string;
}

@Controller('generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
  constructor(
    private readonly generation: ContentGenerationService,
    private readonly referenceMaterial: ReferenceMaterialService,
    private readonly clientAccess: ClientAccessService,
    private readonly avatarQueue: AvatarGenerationQueueService,
    private readonly reelQueue: ReelGenerationQueueService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  @Post('parse-reference')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async parseReference(@UploadedFile() file: Express.Multer.File) {
    return this.referenceMaterial.parseReferenceFile(file);
  }

  @Post('copy')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async generateCopy(@CurrentUser() user: AuthUser, @Body() body: GenerateCopyDto) {
    if (body.clientId) {
      await this.clientAccess.assertClientAccess(user, body.clientId);
    }
    const brief = body.brief?.trim();
    if (!brief) {
      throw new BadRequestException('El brief es obligatorio para generar el texto');
    }
    const platforms =
      body.platforms?.filter(Boolean).length
        ? body.platforms
        : ['facebook', 'instagram'];
    return this.llm.generateCopy({ brief, platforms });
  }

  @Post('from-brief')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async generateFromBrief(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateFromBriefDto,
  ) {
    await this.clientAccess.assertClientAccess(user, body.clientId);
    try {
      return await this.generation.generateFromBrief(user.agencyId, user.id, body);
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Arranca Reel en cola BullMQ (respuesta rápida).
   * Polling: GET /generations/reel/:generationId
   */
  @Post('from-brief-reel')
  @HttpCode(202)
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async generateReelFromBrief(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateReelFromBriefDto,
  ) {
    await this.clientAccess.assertClientAccess(user, body.clientId);
    try {
      const started = await this.generation.startReelFromBrief(
        user.agencyId,
        user.id,
        body,
      );
      await this.reelQueue.enqueue(user.agencyId, started.generationId);
      return started;
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get('reel/:generationId')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner', 'viewer')
  async getReelGeneration(
    @CurrentUser() user: AuthUser,
    @Param('generationId') generationId: string,
  ) {
    try {
      return await this.generation.getReelJobStatus(user.agencyId, generationId);
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  /**
   * Arranca avatar en cola BullMQ (respuesta rápida).
   * Polling: GET /generations/avatar/:generationId
   */
  @Post('from-brief-avatar')
  @HttpCode(202)
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async generateAvatarFromBrief(
    @CurrentUser() user: AuthUser,
    @Body() body: GenerateAvatarFromBriefDto,
  ) {
    await this.clientAccess.assertClientAccess(user, body.clientId);
    try {
      const started = await this.generation.startAvatarFromBrief(
        user.agencyId,
        user.id,
        body,
      );
      await this.avatarQueue.enqueue(user.agencyId, started.generationId);
      return started;
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get('avatar/:generationId')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner', 'viewer')
  async getAvatarGeneration(
    @CurrentUser() user: AuthUser,
    @Param('generationId') generationId: string,
  ) {
    try {
      return await this.generation.getAvatarJobStatus(user.agencyId, generationId);
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
