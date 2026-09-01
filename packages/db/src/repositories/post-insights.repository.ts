import type { Prisma, PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export type UpsertPostInsightData = {
  agencyId: string;
  postTargetId: string;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  engagement?: number | null;
};

export type PlatformMetrics = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement: number;
  publishedTargets: number;
  withMetrics: number;
};

export type AnalyticsSummary = {
  publishedTargets: number;
  withMetrics: number;
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagement: number;
  };
  byPlatform: Record<string, PlatformMetrics>;
  metricBreakdown: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    impressions: number;
    reach: number;
  };
  topPosts: Array<{
    postId: string;
    caption: string | null;
    clientId: string;
    engagement: number;
    impressions: number;
    likes: number;
    comments: number;
    platform: string | null;
    storageUrl: string | null;
  }>;
};

function emptyPlatformMetrics(): PlatformMetrics {
  return {
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
}

function emptyTotals() {
  return {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    engagement: 0,
  };
}

export class PostInsightsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsert(data: UpsertPostInsightData) {
    const metrics = {
      impressions: data.impressions ?? null,
      reach: data.reach ?? null,
      likes: data.likes ?? null,
      comments: data.comments ?? null,
      shares: data.shares ?? null,
      saves: data.saves ?? null,
      engagement: data.engagement ?? null,
      fetched_at: new Date(),
    };

    return this.prisma.post_insights.upsert({
      where: { post_target_id: data.postTargetId },
      create: {
        agency_id: data.agencyId,
        post_target_id: data.postTargetId,
        ...metrics,
      },
      update: metrics,
    });
  }

  findByPostId(agencyId: string, postId: string) {
    return this.prisma.post_insights.findMany({
      where: scopedWhere(agencyId, {
        post_targets: { post_id: postId },
      }),
      include: {
        post_targets: {
          select: {
            id: true,
            platform_post_id: true,
            social_accounts: {
              select: { platform: true, username: true },
            },
          },
        },
      },
      orderBy: { fetched_at: 'desc' },
    });
  }

  findSummary(
    agencyId: string,
    clientId?: string,
    since?: Date,
    platform?: string,
  ): Promise<AnalyticsSummary> {
    return this.buildSummary(agencyId, clientId, since, platform);
  }

  /** Destinos publicados que necesitan sincronizar métricas. */
  findTargetsNeedingSync(staleBefore: Date, limit = 50) {
    return this.prisma.post_targets.findMany({
      where: {
        status: 'published',
        platform_post_id: { not: null },
        social_accounts: {
          is_active: true,
          platform: { in: ['facebook', 'instagram'] },
        },
        OR: [
          { post_insights: { is: null } },
          { post_insights: { is: { fetched_at: { lt: staleBefore } } } },
        ],
      },
      take: limit,
      include: {
        posts: { select: { agency_id: true, client_id: true } },
        social_accounts: {
          select: {
            platform: true,
            external_account_id: true,
            access_token_enc: true,
          },
        },
      },
      orderBy: { published_at: 'asc' },
    });
  }

  private async buildSummary(
    agencyId: string,
    clientId?: string,
    since?: Date,
    platform?: string,
  ): Promise<AnalyticsSummary> {
    const postFilter: Prisma.postsWhereInput = {
      agency_id: agencyId,
      ...(clientId ? { client_id: clientId } : {}),
      ...(since ? { published_at: { gte: since } } : {}),
    };

    const targetFilter: Prisma.post_targetsWhereInput = {
      status: 'published' as const,
      posts: postFilter,
      ...(platform && platform !== 'all'
        ? { social_accounts: { platform: platform as Prisma.Enumsocial_platformFilter['equals'] } }
        : {}),
    };

    const publishedTargets = await this.prisma.post_targets.count({
      where: targetFilter,
    });

    const insights = await this.prisma.post_insights.findMany({
      where: scopedWhere(agencyId, {
        post_targets: targetFilter,
      }),
      include: {
        post_targets: {
          select: {
            post_id: true,
            posts: {
              select: {
                caption: true,
                client_id: true,
                media_assets: {
                  orderBy: { position: 'asc' as const },
                  take: 1,
                  select: { storage_url: true },
                },
              },
            },
            social_accounts: { select: { platform: true } },
          },
        },
      },
    });

    const totals = emptyTotals();
    const byPlatform: Record<string, PlatformMetrics> = {};

    const byPost = new Map<
      string,
      {
        engagement: number;
        impressions: number;
        likes: number;
        comments: number;
        caption: string | null;
        clientId: string;
        platform: string | null;
        storageUrl: string | null;
      }
    >();

    for (const row of insights) {
      const platformKey = row.post_targets.social_accounts.platform;
      if (!byPlatform[platformKey]) {
        byPlatform[platformKey] = emptyPlatformMetrics();
      }
      const plat = byPlatform[platformKey]!;

      totals.impressions += row.impressions ?? 0;
      totals.reach += row.reach ?? 0;
      totals.likes += row.likes ?? 0;
      totals.comments += row.comments ?? 0;
      totals.shares += row.shares ?? 0;
      totals.saves += row.saves ?? 0;
      totals.engagement += row.engagement ?? 0;

      plat.impressions += row.impressions ?? 0;
      plat.reach += row.reach ?? 0;
      plat.likes += row.likes ?? 0;
      plat.comments += row.comments ?? 0;
      plat.shares += row.shares ?? 0;
      plat.saves += row.saves ?? 0;
      plat.engagement += row.engagement ?? 0;
      plat.withMetrics += 1;

      const postId = row.post_targets.post_id;
      const media = row.post_targets.posts.media_assets[0];
      const existing = byPost.get(postId) ?? {
        engagement: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        caption: row.post_targets.posts.caption,
        clientId: row.post_targets.posts.client_id,
        platform: platformKey,
        storageUrl: media?.storage_url ?? null,
      };
      existing.engagement += row.engagement ?? 0;
      existing.impressions += row.impressions ?? 0;
      existing.likes += row.likes ?? 0;
      existing.comments += row.comments ?? 0;
      if (!existing.storageUrl && media?.storage_url) {
        existing.storageUrl = media.storage_url;
      }
      byPost.set(postId, existing);
    }

    const platformTargetCounts = await this.prisma.post_targets.groupBy({
      by: ['social_account_id'],
      where: targetFilter,
      _count: { id: true },
    });

    const accountIds = platformTargetCounts.map((g) => g.social_account_id);
    if (accountIds.length > 0) {
      const accounts = await this.prisma.social_accounts.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, platform: true },
      });
      const platformByAccount = Object.fromEntries(accounts.map((a) => [a.id, a.platform]));
      for (const row of platformTargetCounts) {
        const p = platformByAccount[row.social_account_id];
        if (!p) continue;
        if (!byPlatform[p]) byPlatform[p] = emptyPlatformMetrics();
        byPlatform[p]!.publishedTargets += row._count.id;
      }
    }

    const topPosts = [...byPost.entries()]
      .map(([postId, v]) => ({
        postId,
        caption: v.caption,
        clientId: v.clientId,
        engagement: v.engagement,
        impressions: v.impressions,
        likes: v.likes,
        comments: v.comments,
        platform: v.platform,
        storageUrl: v.storageUrl,
      }))
      .sort((a, b) => b.engagement - a.engagement || b.impressions - a.impressions)
      .slice(0, 10);

    return {
      publishedTargets,
      withMetrics: insights.length,
      totals,
      byPlatform,
      metricBreakdown: {
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        saves: totals.saves,
        impressions: totals.impressions,
        reach: totals.reach,
      },
      topPosts,
    };
  }
}
