import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GenerationsController } from './generations.controller';

@Module({
  imports: [AiModule],
  controllers: [GenerationsController],
})
export class GenerationsModule {}
