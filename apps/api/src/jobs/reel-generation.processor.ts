import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ContentGenerationService } from '../ai/content-generation.service';
import {
  REEL_GENERATION_QUEUE,
  type ReelGenerationJobData,
} from './reel-generation.constants';
import { VIDEO_JOB_WORKER_OPTIONS } from './video-job-options';

/** Dos clips fal (hasta 20 min cada uno) + ffmpeg. El lock se renueva cada 30 s. */
@Processor(REEL_GENERATION_QUEUE, VIDEO_JOB_WORKER_OPTIONS)
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

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ReelGenerationJobData> | undefined, err: Error): Promise<void> {
    const agencyId = job?.data?.agencyId;
    const generationId = job?.data?.generationId;
    if (!agencyId || !generationId) return;
    const message = err?.message || 'El job de Reel falló';
    try {
      await this.generation.failOpenGeneration(agencyId, generationId, message);
    } catch (markErr) {
      this.logger.warn(
        `No se pudo marcar el Reel ${generationId} como fallido: ${
          markErr instanceof Error ? markErr.message : markErr
        }`,
      );
    }
  }
}
