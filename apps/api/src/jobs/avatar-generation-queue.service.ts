import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  AVATAR_GENERATION_QUEUE,
  type AvatarGenerationJobData,
} from './avatar-generation.constants';

@Injectable()
export class AvatarGenerationQueueService {
  constructor(
    @InjectQueue(AVATAR_GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(agencyId: string, generationId: string) {
    const data: AvatarGenerationJobData = { agencyId, generationId };
    await this.queue.add('generate-avatar', data, {
      jobId: `avatar-gen-${generationId}`,
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }
}
