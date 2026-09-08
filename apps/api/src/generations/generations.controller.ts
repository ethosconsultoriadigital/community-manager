import {
  Body,
  Controller,
  Post,
  BadRequestException,
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
}
