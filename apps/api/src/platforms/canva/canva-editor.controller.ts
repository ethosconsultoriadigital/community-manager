import {
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { PostsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../../access/client-access.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { CanvaEditorService } from './canva-editor.service';

@Controller('posts/:postId/canva')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager', 'admin', 'owner')
export class CanvaEditorController {
  constructor(
    private readonly editor: CanvaEditorService,
    private readonly posts: PostsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  @Post('edit-url')
  async createEditUrl(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
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
    return this.editor.createEditUrl(user.agencyId, postId);
  }
}
