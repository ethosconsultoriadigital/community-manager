import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MetaTokenHealthService } from '../platforms/meta/meta-token-health.service';
import { MetaTokenRefreshService } from '../platforms/meta/meta-token-refresh.service';
import { ThreadsTokenRefreshService } from '../platforms/threads/threads-token-refresh.service';
import { XTokenRefreshService } from '../platforms/x/x-token-refresh.service';
import { TikTokTokenRefreshService } from '../platforms/tiktok/tiktok-token-refresh.service';

export const TOKEN_REFRESH_QUEUE = 'token-refresh';
export const META_TOKEN_HEALTH_JOB = 'validate-meta-tokens';

@Processor(TOKEN_REFRESH_QUEUE)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(
    private readonly metaRefresh: MetaTokenRefreshService,
    private readonly metaHealth: MetaTokenHealthService,
    private readonly threadsRefresh: ThreadsTokenRefreshService,
    private readonly xRefresh: XTokenRefreshService,
    private readonly tiktokRefresh: TikTokTokenRefreshService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === META_TOKEN_HEALTH_JOB) {
      const health = await this.metaHealth.validateActiveTokens();
      this.logger.log(
        `Revisión Meta: ${health.checked} revisadas / ${health.marked} requieren reconexión / ${health.failed} no se pudieron revisar`,
      );
      return;
    }

    this.logger.log(`Ejecutando job de refresco de tokens (${job.name})`);
    const meta = await this.metaRefresh.refreshExpiringTokens();
    const threads = await this.threadsRefresh.refreshExpiringTokens();
    const x = await this.xRefresh.refreshExpiringTokens();
    const tiktok = await this.tiktokRefresh.refreshExpiringTokens();
    this.logger.log(
      `Refresco Meta: ${meta.refreshed} ok / ${meta.failed} fail · Threads: ${threads.refreshed} ok / ${threads.failed} fail · X: ${x.refreshed} ok / ${x.failed} fail · TikTok: ${tiktok.refreshed} ok / ${tiktok.failed} fail`,
    );
  }
}
