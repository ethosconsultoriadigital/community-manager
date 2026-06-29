import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PostInsightsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
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
    private readonly syncService: SyncPostInsightsService,
  ) {}

  @Get('analytics/summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? Number(days) : 30;
    const since =
      Number.isFinite(parsedDays) && parsedDays > 0
        ? new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000)
        : undefined;
    return this.insights.findSummary(user.agencyId, clientId, since);
  }

  @Get('posts/:id/insights')
  postInsights(@CurrentUser() user: AuthUser, @Param('id') postId: string) {
    return this.insights.findByPostId(user.agencyId, postId);
  }

  @Post('analytics/sync')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  sync(@CurrentUser() user: AuthUser) {
    return this.syncService.syncStaleMetrics({ agencyId: user.agencyId, limit: 100 });
  }
}
