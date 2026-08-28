import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentSourcesModule } from '../content-sources/content-sources.module';
import { MetaModule } from '../platforms/meta/meta.module';
import { PUBLISH_QUEUE } from './publish.constants';
import { PublishPostService } from './publish-post.service';
import { PublishQueueService } from './publish-queue.service';
import { PublishProcessor } from './publish.processor';
import { RADAR_SYNC_QUEUE } from './radar-sync.constants';
import { RadarSyncProcessor } from './radar-sync.processor';
import { TOKEN_REFRESH_QUEUE, TokenRefreshProcessor } from './token-refresh.processor';

@Module({
  imports: [
    MetaModule,
    ContentSourcesModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
    }),
    BullModule.registerQueue({ name: TOKEN_REFRESH_QUEUE }),
    BullModule.registerQueue({ name: PUBLISH_QUEUE }),
    BullModule.registerQueue({ name: RADAR_SYNC_QUEUE }),
  ],
  providers: [
    TokenRefreshProcessor,
    PublishProcessor,
    PublishPostService,
    PublishQueueService,
    RadarSyncProcessor,
  ],
  exports: [PublishQueueService],
})
export class JobsModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const { Queue } = await import('bullmq');
    const redisUrl = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    const tokenQueue = new Queue(TOKEN_REFRESH_QUEUE, { connection: { url: redisUrl } });
    await tokenQueue.add(
      'refresh-expiring-tokens',
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: 'meta-token-refresh-hourly',
      },
    );
    await tokenQueue.close();

    const publishQueue = new Queue(PUBLISH_QUEUE, { connection: { url: redisUrl } });
    await publishQueue.add(
      'scan-due-posts',
      {},
      {
        repeat: { pattern: '* * * * *' },
        jobId: 'publish-scan-due-minutely',
      },
    );
    await publishQueue.close();

    const radarCron =
      this.config.get<string>('RADAR_SYNC_CRON')?.trim() || '*/15 * * * *';
    const radarEnabled =
      (this.config.get<string>('RADAR_SYNC_ENABLED') ?? 'true').toLowerCase() !== 'false';

    if (radarEnabled) {
      const radarQueue = new Queue(RADAR_SYNC_QUEUE, { connection: { url: redisUrl } });
      await radarQueue.add(
        'sync-all-radar-sources',
        {},
        {
          repeat: { pattern: radarCron },
          jobId: 'radar-sync-repeat',
        },
      );
      await radarQueue.close();
    }
  }
}
