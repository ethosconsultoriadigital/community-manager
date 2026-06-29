import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostInsightsRepository, SocialAccountsRepository } from '@cm/db';
import { decryptToken } from '@cm/shared';
import { MetaMetricsService } from '../platforms/meta/meta-metrics.service';

export type SyncInsightsResult = {
  synced: number;
  failed: number;
  skipped: number;
};

@Injectable()
export class SyncPostInsightsService {
  private readonly logger = new Logger(SyncPostInsightsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly insights: PostInsightsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly metaMetrics: MetaMetricsService,
  ) {}

  async syncStaleMetrics(options?: { agencyId?: string; limit?: number }): Promise<SyncInsightsResult> {
    const staleHours = Number(this.config.get<string>('METRICS_STALE_HOURS') ?? '6');
    const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    const limit = options?.limit ?? 50;

    const targets = await this.insights.findTargetsNeedingSync(staleBefore, limit);
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of targets) {
      if (options?.agencyId && target.posts.agency_id !== options.agencyId) {
        skipped += 1;
        continue;
      }
      if (!target.platform_post_id) {
        skipped += 1;
        continue;
      }

      const platform = target.social_accounts.platform;
      if (platform !== 'facebook' && platform !== 'instagram') {
        skipped += 1;
        continue;
      }

      try {
        const account = await this.socialAccounts.findByIdWithToken(
          target.posts.agency_id,
          target.social_account_id,
        );
        if (!account?.is_active) {
          skipped += 1;
          continue;
        }

        const accessToken = decryptToken(
          account.access_token_enc as Buffer,
          this.requireEncryptionKey(),
        );

        const metrics = await this.metaMetrics.fetchPostMetrics({
          platform,
          platformPostId: target.platform_post_id,
          accessToken,
          externalAccountId: account.external_account_id,
        });

        await this.insights.upsert({
          agencyId: target.posts.agency_id,
          postTargetId: target.id,
          ...metrics,
        });
        synced += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Métricas destino ${target.id}: ${message}`);
      }
    }

    return { synced, failed, skipped };
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }
}
