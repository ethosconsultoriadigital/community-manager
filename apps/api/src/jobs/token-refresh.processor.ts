import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MetaTokenRefreshService } from '../platforms/meta/meta-token-refresh.service';
import { ThreadsTokenRefreshService } from '../platforms/threads/threads-token-refresh.service';
import { XTokenRefreshService } from '../platforms/x/x-token-refresh.service';

export const TOKEN_REFRESH_QUEUE = 'token-refresh';

@Processor(TOKEN_REFRESH_QUEUE)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(
    private readonly metaRefresh: MetaTokenRefreshService,
    private readonly threadsRefresh: ThreadsTokenRefreshService,
    private readonly xRefresh: XTokenRefreshService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Ejecutando job de refresco de tokens (${job.name})`);
    const meta = await this.metaRefresh.refreshExpiringTokens();
    const threads = await this.threadsRefresh.refreshExpiringTokens();
    const x = await this.xRefresh.refreshExpiringTokens();
    this.logger.log(
      `Refresco Meta: ${meta.refreshed} ok / ${meta.failed} fail · Threads: ${threads.refreshed} ok / ${threads.failed} fail · X: ${x.refreshed} ok / ${x.failed} fail`,
    );
  }
}
