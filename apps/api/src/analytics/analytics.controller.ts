import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PostInsightsRepository, PostsRepository, type AnalyticsSummary } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AnalyticsReportService } from './analytics-report.service';
import { SyncPostInsightsService } from './sync-post-insights.service';

function emptyAnalyticsSummary(): AnalyticsSummary {
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
    byPlatform: {},
    metricBreakdown: {
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      impressions: 0,
      reach: 0,
    },
    topPosts: [],
  };
}

function mergeAnalyticsSummaries(parts: AnalyticsSummary[]): AnalyticsSummary {
  const merged = emptyAnalyticsSummary();
  for (const part of parts) {
    merged.publishedTargets += part.publishedTargets;
    merged.withMetrics += part.withMetrics;
    for (const key of Object.keys(merged.totals) as Array<keyof typeof merged.totals>) {
      merged.totals[key] += part.totals[key];
    }
    for (const key of Object.keys(merged.metricBreakdown) as Array<
      keyof typeof merged.metricBreakdown
    >) {
      merged.metricBreakdown[key] += part.metricBreakdown[key];
    }
    for (const [platform, metrics] of Object.entries(part.byPlatform)) {
      const current = merged.byPlatform[platform] ?? {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        engagement: 0,
        publishedTargets: 0,
        withMetrics: 0,
      };
      merged.byPlatform[platform] = {
        impressions: current.impressions + metrics.impressions,
        reach: current.reach + metrics.reach,
        likes: current.likes + metrics.likes,
        comments: current.comments + metrics.comments,
        shares: current.shares + metrics.shares,
        saves: current.saves + metrics.saves,
        engagement: current.engagement + metrics.engagement,
        publishedTargets: current.publishedTargets + metrics.publishedTargets,
        withMetrics: current.withMetrics + metrics.withMetrics,
      };
    }
    merged.topPosts.push(...part.topPosts);
  }
  merged.topPosts.sort((a, b) => b.engagement - a.engagement);
  merged.topPosts = merged.topPosts.slice(0, 10);
  return merged;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly insights: PostInsightsRepository,
    private readonly posts: PostsRepository,
    private readonly syncService: SyncPostInsightsService,
    private readonly clientAccess: ClientAccessService,
    private readonly reportService: AnalyticsReportService,
  ) {}

  @Get('analytics/summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @Query('days') days?: string,
    @Query('platform') platform?: string,
  ) {
    const scope = await this.clientAccess.resolveListScope(user, clientId);
    if (scope.mode === 'none') {
      return emptyAnalyticsSummary();
    }
    const filter = scope.mode === 'single' ? scope.clientId : undefined;
    // Multi sin clientId: agregamos todos los asignados (no toda la agencia)
    const clientIds = scope.mode === 'multi' ? scope.clientIds : undefined;
    const parsedDays = days ? Number(days) : 30;
    const since =
      Number.isFinite(parsedDays) && parsedDays > 0
        ? new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000)
        : undefined;
    const platformFilter =
      platform && platform !== 'all' ? platform : undefined;

    if (clientIds?.length) {
      const summaries = await Promise.all(
        clientIds.map((cid) =>
          this.insights.findSummary(user.agencyId, cid, since, platformFilter),
        ),
      );
      return mergeAnalyticsSummaries(summaries);
    }

    return this.insights.findSummary(user.agencyId, filter, since, platformFilter);
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
    if (scope.mode === 'multi') {
      let synced = 0;
      let failed = 0;
      let skipped = 0;
      for (const cid of scope.clientIds) {
        const part = await this.syncService.syncStaleMetrics({
          agencyId: user.agencyId,
          clientId: cid,
          limit: 100,
        });
        synced += part.synced;
        failed += part.failed;
        skipped += part.skipped;
      }
      return { synced, failed, skipped };
    }
    return this.syncService.syncStaleMetrics({
      agencyId: user.agencyId,
      clientId: scope.mode === 'single' ? scope.clientId : undefined,
      limit: 100,
    });
  }

  @Post('analytics/report/pdf')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async reportPdf(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string | undefined,
    @Query('days') days: string | undefined,
    @Query('platform') platform: string | undefined,
    @Res() res: Response,
  ) {
    if (clientId) {
      await this.clientAccess.assertClientAccess(user, clientId);
    } else {
      const scope = await this.clientAccess.resolveListScope(user);
      if (scope.mode === 'none') {
        res.status(403).json({ message: 'Sin acceso a clientes' });
        return;
      }
    }

    const parsedDays = days ? Number(days) : 30;
    const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30;

    const pdf = await this.reportService.generatePdf({
      agencyId: user.agencyId,
      userId: user.id,
      clientId,
      days: safeDays,
      platform: platform && platform !== 'all' ? platform : undefined,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte-${safeDays}d.pdf"`,
    );
    res.send(pdf);
  }
}
