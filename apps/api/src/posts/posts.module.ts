import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
import { ApprovalsParrillaService } from './approvals-parrilla.service';
import { PostsController } from './posts.controller';

@Module({
  imports: [JobsModule, MediaModule],
  controllers: [PostsController],
  providers: [ApprovalsParrillaService],
})
export class PostsModule {}
