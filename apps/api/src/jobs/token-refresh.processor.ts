import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MetaTokenRefreshService } from '../platforms/meta/meta-token-refresh.service';

export const TOKEN_REFRESH_QUEUE = 'token-refresh';

@Processor(TOKEN_REFRESH_QUEUE)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(private readonly refreshService: MetaTokenRefreshService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Ejecutando job de refresco de tokens (${job.name})`);
    const result = await this.refreshService.refreshExpiringTokens();
    this.logger.log(
      `Refresco completado: ${result.refreshed} actualizados, ${result.failed} fallidos`,
    );
  }
}
