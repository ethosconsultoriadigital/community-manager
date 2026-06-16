import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ContentSourcesRepository,
  ContentSourcesValidationError,
  SourceItemsRepository,
  SourceItemsValidationError,
} from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { IngestionService } from './ingestion.service';
import { PromoteItemService } from './promote-item.service';

class CreateContentSourceDto {
  clientId!: string;
  type!: 'sheet' | 'news_radar' | 'rss' | 'manual_calendar';
  name!: string;
  config?: Record<string, unknown>;
  minScore?: number;
}

class PromoteItemDto {
  socialAccountIds!: string[];
}

@Controller('content-sources')
@UseGuards(JwtAuthGuard)
export class ContentSourcesController {
  constructor(
    private readonly contentSources: ContentSourcesRepository,
    private readonly sourceItems: SourceItemsRepository,
    private readonly ingestion: IngestionService,
    private readonly promoteItem: PromoteItemService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateContentSourceDto) {
    try {
      return await this.contentSources.create(user.agencyId, body);
    } catch (error) {
      if (error instanceof ContentSourcesValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    return this.contentSources.findAll(user.agencyId, clientId);
  }

  @Get(':id/items')
  async listItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('minScoreOnly') minScoreOnly?: string,
  ) {
    const source = await this.contentSources.findById(user.agencyId, id);
    if (!source) throw new NotFoundException('Fuente no encontrada');

    const minScore =
      minScoreOnly === 'true' && source.min_score
        ? Number(source.min_score)
        : undefined;

    return this.sourceItems.findBySource(user.agencyId, id, { minScore });
  }

  @Post(':id/ingest')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async ingest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    try {
      return await this.ingestion.ingest(user.agencyId, id);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

@Controller('source-items')
@UseGuards(JwtAuthGuard)
export class SourceItemsController {
  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly promoteItem: PromoteItemService,
  ) {}

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    try {
      const item = await this.sourceItems.approve(user.agencyId, id);
      if (!item) throw new NotFoundException('Item no encontrado');
      return item;
    } catch (error) {
      if (error instanceof SourceItemsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/promote')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async promote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PromoteItemDto,
  ) {
    try {
      const result = await this.promoteItem.promote(user.agencyId, user.id, id, body);
      if (!result) throw new NotFoundException('Item no encontrado');
      return result;
    } catch (error) {
      if (error instanceof SourceItemsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
