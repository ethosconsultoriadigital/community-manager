import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaModule } from '../platforms/meta/meta.module';
import { PUBLISH_QUEUE } from './publish.constants';
import { PublishPostService } from './publish-post.service';
import { PublishQueueService } from './publish-queue.service';
import { PublishProcessor } from './publish.processor';
import { TOKEN_REFRESH_QUEUE, TokenRefreshProcessor } from './token-refresh.processor';

@Module({
  imports: [
    MetaModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
    }),
    BullModule.registerQueue({ name: TOKEN_REFRESH_QUEUE }),
    BullModule.registerQueue({ name: PUBLISH_QUEUE }),
  ],
  providers: [
    TokenRefreshProcessor,
    PublishProcessor,
    PublishPostService,
    PublishQueueService,
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
  }
}
