import { Controller, Get, Param, Post, Query, UseGuards, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ContentSourcesRepository, PostInsightsRepository, PostsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { SyncPostInsightsService } from './sync-post-insights.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly insights: PostInsightsRepository,
    private readonly posts: PostsRepository,
    private readonly syncService: SyncPostInsightsService,
    private readonly clientAccess: ClientAccessService,
  ) {}

  @Get('analytics/summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @Query('days') days?: string,
  ) {
    const scope = await this.clientAccess.resolveListScope(user, clientId);
    if (scope.mode === 'none') {
      return {
        publishedTargets: 0,
        withMetrics: 0,
        totals: {
          impressions: 0,
          reach: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          engagement: 0,
        },
        topPosts: [],
      };
    }
    const filter = scope.mode === 'single' ? scope.clientId : undefined;
    const parsedDays = days ? Number(days) : 30;
    const since =
      Number.isFinite(parsedDays) && parsedDays > 0
        ? new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000)
        : undefined;
    return this.insights.findSummary(user.agencyId, filter, since);
  }

  @Get('posts/:id/insights')
  async postInsights(@CurrentUser() user: AuthUser, @Param('id') postId: string) {
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
    return this.insights.findByPostId(user.agencyId, postId);
  }

  @Post('analytics/sync')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async sync(@CurrentUser() user: AuthUser) {
    const scope = await this.clientAccess.resolveListScope(user);
    if (scope.mode === 'none') {
      return { synced: 0, failed: 0, skipped: 0 };
    }
    return this.syncService.syncStaleMetrics({
      agencyId: user.agencyId,
      clientId: scope.mode === 'single' ? scope.clientId : undefined,
      limit: 100,
    });
  }
}
