import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApprovalsRepository, PostsRepository, PostsValidationError } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PublishQueueService } from '../jobs/publish-queue.service';

class CreatePostDto {
  clientId!: string;
  caption?: string;
  hashtags?: string[];
  socialAccountIds!: string[];
}

class UpdatePostDto {
  caption?: string;
  hashtags?: string[];
  socialAccountIds?: string[];
}

class SchedulePostDto {
  scheduledAt!: string;
}

class RejectPostDto {
  comment?: string;
}

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private readonly posts: PostsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly publishQueue: PublishQueueService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreatePostDto) {
    try {
      return await this.posts.create(user.agencyId, user.id, body);
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    return this.posts.findAll(user.agencyId, clientId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const post = await this.posts.findById(user.agencyId, id);
    if (!post) throw new NotFoundException('Post no encontrado');
    return post;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdatePostDto,
  ) {
    try {
      const post = await this.posts.update(user.agencyId, id, body);
      if (!post) throw new NotFoundException('Post no encontrado');
      return post;
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/submit-for-approval')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async submitForApproval(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    try {
      const post = await this.posts.submitForApproval(user.agencyId, id);
      if (!post) throw new NotFoundException('Post no encontrado');
      return post;
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const approval = await this.approvals.approveLatest(user.agencyId, id, user.id);
    if (!approval) {
      throw new BadRequestException('No hay solicitud de aprobación pendiente');
    }

    const post = await this.posts.markApproved(user.agencyId, id);
    if (!post) throw new NotFoundException('Post no encontrado');
    return post;
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RejectPostDto,
  ) {
    const approval = await this.approvals.rejectLatest(
      user.agencyId,
      id,
      user.id,
      body.comment,
    );
    if (!approval) {
      throw new BadRequestException('No hay solicitud de aprobación pendiente');
    }

    const post = await this.posts.markRejected(user.agencyId, id);
    if (!post) throw new NotFoundException('Post no encontrado');
    return post;
  }

  @Post(':id/schedule')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SchedulePostDto,
  ) {
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt debe ser una fecha ISO válida');
    }

    try {
      const post = await this.posts.schedule(user.agencyId, id, scheduledAt);
      if (!post) throw new NotFoundException('Post no encontrado');

      await this.publishQueue.enqueuePost(user.agencyId, id, scheduledAt);
      return post;
    } catch (error) {
      if (error instanceof PostsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const deleted = await this.posts.delete(user.agencyId, id);
    if (!deleted) throw new NotFoundException('Post no encontrado');
    return { deleted: true };
  }
}
