import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  BadRequestException,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentSourcesRepository,
  ContentSourcesValidationError,
  SourceItemsRepository,
  SourceItemsValidationError,
} from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { IngestionService } from './ingestion.service';
import { PromoteItemService } from './promote-item.service';
import { RadarSyncService } from './radar-sync.service';
import { PurgeInvalidPendingService } from './purge-invalid-pending.service';
import { parseServiceAccountJson } from './google-sheets-auth';
import { calendarDateInTz } from './radarmex-columns';

class CreateContentSourceDto {
  clientId!: string;
  type!: 'sheet' | 'news_radar' | 'rss' | 'manual_calendar';
  name!: string;
  config?: Record<string, unknown>;
  minScore?: number;
}

class UpdateContentSourceDto {
  name?: string;
  config?: Record<string, unknown>;
  minScore?: number | null;
  isActive?: boolean;
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
    private readonly radarSync: RadarSyncService,
    private readonly purgePending: PurgeInvalidPendingService,
    private readonly clientAccess: ClientAccessService,
    private readonly config: ConfigService,
  ) {}

  @Get('google-status')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  googleStatus() {
    const raw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!raw) {
      return { configured: false, clientEmail: null as string | null };
    }
    try {
      const sa = parseServiceAccountJson(raw);
      return { configured: true, clientEmail: sa.client_email };
    } catch {
      return { configured: false, clientEmail: null as string | null };
    }
  }

  @Post('purge-invalid-pending')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async purgeInvalidPending(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
  ) {
    if (clientId) {
      await this.clientAccess.assertClientAccess(user, clientId);
    } else {
      const scope = await this.clientAccess.resolveListScope(user);
      if (scope.mode === 'none') {
        return { scanned: 0, deleted: 0, kept: 0 };
      }
      if (scope.mode === 'single') {
        return this.purgePending.purge(user.agencyId, scope.clientId);
      }
    }
    return this.purgePending.purge(user.agencyId, clientId);
  }

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  today() {
    return { today: calendarDateInTz(new Date()) };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateContentSourceDto) {
    await this.clientAccess.assertClientAccess(user, body.clientId);
    try {
      return await this.contentSources.create(user.agencyId, {
        ...body,
        minScore: body.minScore ?? 0.7,
        config: body.config ?? {},
      });
    } catch (error) {
      if (error instanceof ContentSourcesValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    const scope = await this.clientAccess.resolveListScope(user, clientId);
    if (scope.mode === 'none') return [];
    const filter = scope.mode === 'single' ? scope.clientId : undefined;
    return this.contentSources.findAll(user.agencyId, filter);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateContentSourceDto,
  ) {
    await this.getSourceOrThrow(user, id);
    const updated = await this.contentSources.update(user.agencyId, id, body);
    if (!updated) throw new NotFoundException('Fuente no encontrada');
    return updated;
  }

  @Get(':id/items')
  async listItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('minScoreOnly') minScoreOnly?: string,
  ) {
    const source = await this.getSourceOrThrow(user, id);

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
    await this.getSourceOrThrow(user, id);
    try {
      return await this.ingestion.ingest(user.agencyId, id);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/sync')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.getSourceOrThrow(user, id);
    try {
      return await this.radarSync.syncSource(user.agencyId, user.id, id);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async getSourceOrThrow(user: AuthUser, id: string) {
    const source = await this.contentSources.findById(user.agencyId, id);
    if (!source) throw new NotFoundException('Fuente no encontrada');
    try {
      await this.clientAccess.assertClientAccess(user, source.client_id);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Fuente no encontrada');
      }
      throw error;
    }
    return source;
  }
}

@Controller('source-items')
@UseGuards(JwtAuthGuard)
export class SourceItemsController {
  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly promoteItem: PromoteItemService,
    private readonly clientAccess: ClientAccessService,
  ) {}

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.getItemOrThrow(user, id);
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
    await this.getItemOrThrow(user, id);
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

  private async getItemOrThrow(user: AuthUser, id: string) {
    const item = await this.sourceItems.findById(user.agencyId, id);
    if (!item) throw new NotFoundException('Item no encontrado');
    try {
      await this.clientAccess.assertClientAccess(user, item.client_id);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Item no encontrado');
      }
      throw error;
    }
    return item;
  }
}
