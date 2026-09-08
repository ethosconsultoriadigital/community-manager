import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  LibraryItemsRepository,
  LibraryItemsValidationError,
  PostsRepository,
} from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { filterRowsByClientIds, scopeToClientFilter } from '../access/scope-filters';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';

class CreateLibraryItemDto {
  clientId!: string;
  kind!: 'text' | 'image' | 'video';
  title?: string | null;
  caption?: string | null;
  hashtags?: string[];
  storageUrl?: string | null;
  mediaSource?: 'upload' | 'ai_generated' | 'canva' | null;
}

class AttachToPostDto {
  postId!: string;
  replace?: boolean;
}

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryItemsRepository,
    private readonly posts: PostsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @Query('kind') kind?: 'text' | 'image' | 'video',
  ) {
    const scope = await this.clientAccess.resolveListScope(user, clientId);
    if (scope.mode === 'none') return [];
    const { clientId: filter, clientIds } = scopeToClientFilter(scope);
    const items = await this.library.findAll(user.agencyId, {
      clientId: filter,
      kind,
    });
    if (clientIds) return filterRowsByClientIds(items, clientIds);
    return items;
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateLibraryItemDto) {
    await this.clientAccess.assertClientAccess(user, body.clientId);
    try {
      return await this.library.create(user.agencyId, user.id, {
        clientId: body.clientId,
        kind: body.kind,
        title: body.title,
        caption: body.caption,
        hashtags: body.hashtags,
        storageUrl: body.storageUrl,
        mediaSource: body.mediaSource,
      });
    } catch (error) {
      if (error instanceof LibraryItemsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post('from-post/:postId')
  async createFromPost(
    @CurrentUser() user: AuthUser,
    @Param('postId') postId: string,
  ) {
    const post = await this.posts.findById(user.agencyId, postId);
    if (!post) throw new NotFoundException('Post no encontrado');
    try {
      await this.clientAccess.assertPostAccess(user, post);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Post no encontrado');
      }
      throw error;
    }

    try {
      const items = await this.library.createFromPost(user.agencyId, postId, user.id);
      if (!items) throw new NotFoundException('Post no encontrado');
      return { created: items.length, items };
    } catch (error) {
      if (error instanceof LibraryItemsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/attach-to-post')
  async attachToPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AttachToPostDto,
  ) {
    const item = await this.library.findById(user.agencyId, id);
    if (!item) throw new NotFoundException('Ítem no encontrado');
    await this.clientAccess.assertClientAccess(user, item.client_id);

    const post = await this.posts.findById(user.agencyId, body.postId);
    if (!post) throw new NotFoundException('Post no encontrado');
    try {
      await this.clientAccess.assertPostAccess(user, post);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Post no encontrado');
      }
      throw error;
    }

    try {
      const media = await this.library.attachToPost(user.agencyId, id, body.postId, {
        replace: body.replace !== false,
      });
      if (!media) throw new NotFoundException('Ítem no encontrado');
      return media;
    } catch (error) {
      if (error instanceof LibraryItemsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const item = await this.library.findById(user.agencyId, id);
    if (!item) throw new NotFoundException('Ítem no encontrado');
    await this.clientAccess.assertClientAccess(user, item.client_id);
    const deleted = await this.library.delete(user.agencyId, id);
    if (!deleted) throw new NotFoundException('Ítem no encontrado');
    return { deleted: true };
  }
}
