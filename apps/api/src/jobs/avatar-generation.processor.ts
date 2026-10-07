import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ContentGenerationService } from '../ai/content-generation.service';
import {
  AVATAR_GENERATION_QUEUE,
  type AvatarGenerationJobData,
} from './avatar-generation.constants';

/** Lip-sync + TTS puede superar varios minutos; evita stalled jobs en Render. */
@Processor(AVATAR_GENERATION_QUEUE, { lockDuration: 900_000 })
export class AvatarGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(AvatarGenerationProcessor.name);

  constructor(private readonly generation: ContentGenerationService) {
    super();
  }

  async process(job: Job<AvatarGenerationJobData>): Promise<void> {
    const { agencyId, generationId } = job.data;
    this.logger.log(`Avatar job ${generationId} (agency ${agencyId})`);
    try {
      await this.generation.processAvatarJob(agencyId, generationId);
    } catch (err) {
      this.logger.warn(
        `Avatar job ${generationId} falló: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }
}
