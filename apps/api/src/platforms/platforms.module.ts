import { Module } from '@nestjs/common';
import { MetaModule } from './meta/meta.module';
import { ThreadsModule } from './threads/threads.module';
import { PlatformPublisherRegistry } from './platform-publisher.registry';
import { PlatformsController } from './platforms.controller';

@Module({
  imports: [MetaModule, ThreadsModule],
  controllers: [PlatformsController],
  providers: [PlatformPublisherRegistry],
  exports: [MetaModule, ThreadsModule, PlatformPublisherRegistry],
})
export class PlatformsModule {}
