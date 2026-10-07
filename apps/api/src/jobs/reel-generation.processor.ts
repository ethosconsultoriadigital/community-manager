import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ContentGenerationService } from '../ai/content-generation.service';
import {
  REEL_GENERATION_QUEUE,
  type ReelGenerationJobData,
} from './reel-generation.constants';

/** Multi-escena fal puede superar 10–15 min; evita stalled jobs. */
@Processor(REEL_GENERATION_QUEUE, { lockDuration: 1_200_000 })
export class ReelGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReelGenerationProcessor.name);

  constructor(private readonly generation: ContentGenerationService) {
    super();
  }

  async process(job: Job<ReelGenerationJobData>): Promise<void> {
    const { agencyId, generationId } = job.data;
    this.logger.log(`Reel job ${generationId} (agency ${agencyId})`);
    try {
      await this.generation.processReelJob(agencyId, generationId);
    } catch (err) {
      this.logger.warn(
        `Reel job ${generationId} falló: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
