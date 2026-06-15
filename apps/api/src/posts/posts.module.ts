import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PostsController } from './posts.controller';

@Module({
  imports: [JobsModule],
  controllers: [PostsController],
})
export class PostsModule {}
