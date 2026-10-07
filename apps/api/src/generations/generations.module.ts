import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { GenerationsController } from './generations.controller';

@Module({
  imports: [AiModule, JobsModule],
  controllers: [GenerationsController],
})
export class GenerationsModule {}
