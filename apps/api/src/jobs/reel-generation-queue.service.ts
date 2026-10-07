import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  REEL_GENERATION_QUEUE,
  type ReelGenerationJobData,
} from './reel-generation.constants';

@Injectable()
export class ReelGenerationQueueService {
  constructor(@InjectQueue(REEL_GENERATION_QUEUE) private readonly queue: Queue) {}

  async enqueue(agencyId: string, generationId: string) {
    const data: ReelGenerationJobData = { agencyId, generationId };
    await this.queue.add('generate-reel', data, {
      jobId: `reel-gen-${generationId}`,
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }
}
