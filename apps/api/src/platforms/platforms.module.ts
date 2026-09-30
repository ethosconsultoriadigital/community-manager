import { Module } from '@nestjs/common';
import { MetaModule } from './meta/meta.module';
import { ThreadsModule } from './threads/threads.module';
import { XModule } from './x/x.module';
import { TikTokModule } from './tiktok/tiktok.module';
import { PlatformPublisherRegistry } from './platform-publisher.registry';
import { PlatformsController } from './platforms.controller';

@Module({
  imports: [MetaModule, ThreadsModule, XModule, TikTokModule],
  controllers: [PlatformsController],
  providers: [PlatformPublisherRegistry],
  exports: [
    MetaModule,
    ThreadsModule,
    XModule,
    TikTokModule,
    PlatformPublisherRegistry,
  ],
})
export class PlatformsModule {}
