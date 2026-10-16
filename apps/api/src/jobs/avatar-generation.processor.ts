import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ContentGenerationService } from '../ai/content-generation.service';
import {
  AVATAR_GENERATION_QUEUE,
  type AvatarGenerationJobData,
} from './avatar-generation.constants';
import { VIDEO_JOB_WORKER_OPTIONS } from './video-job-options';

/** TTS + lip-sync fal (hasta 20 min) + ffmpeg. El lock se renueva cada 30 s. */
@Processor(AVATAR_GENERATION_QUEUE, VIDEO_JOB_WORKER_OPTIONS)
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

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AvatarGenerationJobData> | undefined, err: Error): Promise<void> {
    const agencyId = job?.data?.agencyId;
    const generationId = job?.data?.generationId;
    if (!agencyId || !generationId) return;
    const message = err?.message || 'El job de avatar falló';
    try {
      await this.generation.failOpenGeneration(agencyId, generationId, message);
    } catch (markErr) {
      this.logger.warn(
        `No se pudo marcar el avatar ${generationId} como fallido: ${
          markErr instanceof Error ? markErr.message : markErr
        }`,
      );
    }
  }
}
