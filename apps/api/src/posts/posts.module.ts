import { Module } from '@nestjs/common';
import { ContentSourcesModule } from '../content-sources/content-sources.module';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
import { ApprovalsParrillaService } from './approvals-parrilla.service';
import { PostsController } from './posts.controller';

@Module({
  imports: [JobsModule, MediaModule, ContentSourcesModule],
  controllers: [PostsController],
  providers: [ApprovalsParrillaService],
})
export class PostsModule {}
