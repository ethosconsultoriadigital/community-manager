import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaModule } from '../platforms/meta/meta.module';
import { AnalyticsController } from './analytics.controller';
import { METRICS_SYNC_QUEUE } from './metrics-sync.constants';
import { MetricsSyncProcessor } from './metrics-sync.processor';
import { SyncPostInsightsService } from './sync-post-insights.service';

@Module({
  imports: [
    MetaModule,
    BullModule.registerQueue({ name: METRICS_SYNC_QUEUE }),
  ],
  controllers: [AnalyticsController],
  providers: [SyncPostInsightsService, MetricsSyncProcessor],
  exports: [SyncPostInsightsService],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const { Queue } = await import('bullmq');
    const redisUrl = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const queue = new Queue(METRICS_SYNC_QUEUE, { connection: { url: redisUrl } });
    await queue.add(
      'sync-post-insights',
      {},
      {
        repeat: { pattern: '0 */6 * * *' },
        jobId: 'metrics-sync-every-6h',
      },
    );
    await queue.close();
  }
}
