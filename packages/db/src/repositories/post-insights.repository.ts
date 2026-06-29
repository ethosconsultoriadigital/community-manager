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
  topPosts: Array<{
    postId: string;
    caption: string | null;
    clientId: string;
    engagement: number;
    impressions: number;
    likes: number;
  }>;
};

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

  findSummary(agencyId: string, clientId?: string, since?: Date): Promise<AnalyticsSummary> {
    return this.buildSummary(agencyId, clientId, since);
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
  ): Promise<AnalyticsSummary> {
    const postFilter: Prisma.postsWhereInput = {
      agency_id: agencyId,
      ...(clientId ? { client_id: clientId } : {}),
      ...(since ? { published_at: { gte: since } } : {}),
    };

    const publishedTargets = await this.prisma.post_targets.count({
      where: {
        status: 'published',
        posts: postFilter,
      },
    });

    const insights = await this.prisma.post_insights.findMany({
      where: scopedWhere(agencyId, {
        post_targets: {
          status: 'published' as const,
          posts: postFilter,
        },
      }),
      include: {
        post_targets: {
          select: {
            post_id: true,
            posts: { select: { caption: true, client_id: true } },
          },
        },
      },
    });

    const totals = {
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      engagement: 0,
    };

    const byPost = new Map<
      string,
      { engagement: number; impressions: number; likes: number; caption: string | null; clientId: string }
    >();

    for (const row of insights) {
      totals.impressions += row.impressions ?? 0;
      totals.reach += row.reach ?? 0;
      totals.likes += row.likes ?? 0;
      totals.comments += row.comments ?? 0;
      totals.shares += row.shares ?? 0;
      totals.saves += row.saves ?? 0;
      totals.engagement += row.engagement ?? 0;

      const postId = row.post_targets.post_id;
      const existing = byPost.get(postId) ?? {
        engagement: 0,
        impressions: 0,
        likes: 0,
        caption: row.post_targets.posts.caption,
        clientId: row.post_targets.posts.client_id,
      };
      existing.engagement += row.engagement ?? 0;
      existing.impressions += row.impressions ?? 0;
      existing.likes += row.likes ?? 0;
      byPost.set(postId, existing);
    }

    const topPosts = [...byPost.entries()]
      .map(([postId, v]) => ({
        postId,
        caption: v.caption,
        clientId: v.clientId,
        engagement: v.engagement,
        impressions: v.impressions,
        likes: v.likes,
      }))
      .sort((a, b) => b.engagement - a.engagement || b.impressions - a.impressions)
      .slice(0, 10);

    return {
      publishedTargets,
      withMetrics: insights.length,
      totals,
      topPosts,
    };
  }
}
