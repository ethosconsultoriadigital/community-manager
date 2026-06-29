import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { METRICS_SYNC_QUEUE } from './metrics-sync.constants';
import { SyncPostInsightsService } from './sync-post-insights.service';

@Processor(METRICS_SYNC_QUEUE)
export class MetricsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MetricsSyncProcessor.name);

  constructor(private readonly syncService: SyncPostInsightsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Sincronizando métricas (${job.name})`);
    const result = await this.syncService.syncStaleMetrics();
    this.logger.log(
      `Métricas: ${result.synced} ok, ${result.failed} fallidas, ${result.skipped} omitidas`,
    );
  }
}
