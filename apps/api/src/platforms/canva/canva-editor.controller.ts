import {
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { CanvaEditorService } from './canva-editor.service';

@Controller('posts/:postId/canva')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager', 'admin', 'owner')
export class CanvaEditorController {
  constructor(private readonly editor: CanvaEditorService) {}

  @Post('edit-url')
  createEditUrl(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
    return this.editor.createEditUrl(user.agencyId, postId);
  }
}
