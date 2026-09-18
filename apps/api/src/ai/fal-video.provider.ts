import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStorageService } from '../media/media-storage.service';
import { buildVideoPrompt } from './build-video-prompt';
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoProvider,
} from './interfaces/video-provider.interface';

type FalQueueSubmit = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  detail?: string;
  error?: string;
};

type FalQueueStatus = {
  status?: string;
  response_url?: string;
  error?: string;
};

type FalVideoResult = {
  video?: { url?: string };
  detail?: string;
  error?: string;
};

const DEFAULT_T2V = 'fal-ai/minimax/video-01';
const DEFAULT_I2V = 'fal-ai/minimax/video-01/image-to-video';
const POLL_MS = 2500;
const MAX_POLLS = 90;

@Injectable()
export class FalVideoProvider implements VideoProvider {
  private readonly logger = new Logger(FalVideoProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new BadRequestException(
        'Falta FAL_KEY para generar Reels con fal.ai',
      );
    }
    if (!input.agencyId) {
      throw new BadRequestException('agencyId es obligatorio para guardar el video');
    }

    const prompt = buildVideoPrompt({
      brief: input.prompt,
      caption: input.caption,
      hashtags: input.hashtags,
      referenceText: input.referenceText,
    });
    if (!input.prompt.trim()) {
      throw new BadRequestException('El brief es obligatorio para generar el Reel');
    }

    const hasImage = Boolean(input.referenceImageUrl?.trim());
    const model = hasImage
      ? this.config.get<string>('FAL_IMAGE_TO_VIDEO_MODEL')?.trim() || DEFAULT_I2V
      : this.config.get<string>('FAL_VIDEO_MODEL')?.trim() || DEFAULT_T2V;

    const falInput: Record<string, unknown> = {
      prompt,
      prompt_optimizer: true,
    };
    if (hasImage) {
      falInput.image_url = input.referenceImageUrl!.trim();
    }

    const videoUrl = await this.runFalJob(apiKey, model, falInput);
    const buffer = await this.downloadBinary(videoUrl);
    const stored = await this.mediaStorage.save({
      agencyId: input.agencyId,
      buffer,
      extension: 'mp4',
      contentType: 'video/mp4',
    });

    return {
      url: stored.storageUrl,
      width: 720,
      height: 1280,
      model,
      provider: 'fal',
    };
  }

  private async runFalJob(
    apiKey: string,
    model: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const submitRes = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const submitted = (await submitRes.json()) as FalQueueSubmit;
    if (!submitRes.ok) {
      const message =
        submitted.detail || submitted.error || `fal queue HTTP ${submitRes.status}`;
      this.logger.warn(`fal submit failed: ${message}`);
      throw new BadRequestException(`No se pudo iniciar el Reel: ${message}`);
    }

    const statusUrl = submitted.status_url;
    const responseUrl = submitted.response_url;
    if (!statusUrl || !responseUrl) {
      throw new BadRequestException('fal no devolvió status_url/response_url');
    }

    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      const statusBody = (await statusRes.json()) as FalQueueStatus;
      if (!statusRes.ok) {
        throw new BadRequestException(
          `Error consultando fal: ${statusBody.error ?? statusRes.status}`,
        );
      }

      const st = (statusBody.status ?? '').toUpperCase();
      if (st === 'COMPLETED') {
        const resultRes = await fetch(statusBody.response_url || responseUrl, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = (await resultRes.json()) as FalVideoResult;
        if (!resultRes.ok) {
          throw new BadRequestException(
            result.detail || result.error || `fal result HTTP ${resultRes.status}`,
          );
        }
        const url = result.video?.url;
        if (!url) {
          throw new BadRequestException('fal no devolvió URL de video');
        }
        return url;
      }
      if (st === 'FAILED' || st === 'CANCELLED') {
        throw new BadRequestException(
          `Generación de Reel falló en fal (${st})`,
        );
      }
    }

    throw new BadRequestException(
      'La generación del Reel tardó demasiado. Intenta de nuevo en unos minutos.',
    );
  }

  private resolveApiKey(): string | null {
    return this.config.get<string>('FAL_KEY')?.trim() || null;
  }

  private async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(
        `No se pudo descargar el video de fal (${response.status})`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
