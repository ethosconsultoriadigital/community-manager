import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from '../media/media-storage.service';
import { buildVideoPrompt } from './build-video-prompt';
import { downloadUrlToFile } from './download-to-file';
import { runFalQueueJob } from './fal-queue';
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoProvider,
} from './interfaces/video-provider.interface';

const DEFAULT_T2V = 'fal-ai/minimax/video-01';
const DEFAULT_I2V = 'fal-ai/minimax/video-01/image-to-video';

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

    const result = await runFalQueueJob({
      apiKey,
      model,
      body: falInput,
      logger: this.logger,
      failLabel: 'Reel',
    });

    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) {
      throw new BadRequestException('fal no devolvió URL de video');
    }

    const workDir = await mkdtemp(join(tmpdir(), 'cm-fal-vid-'));
    try {
      const localPath = join(workDir, 'clip.mp4');
      await downloadUrlToFile(videoUrl, localPath);
      const stored = await this.mediaStorage.saveFromFile({
        agencyId: input.agencyId,
        filePath: localPath,
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
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private resolveApiKey(): string | null {
    return this.config.get<string>('FAL_KEY')?.trim() || null;
  }
}

function extractVideoUrl(result: Record<string, unknown>): string | null {
  const video = result.video;
  if (video && typeof video === 'object') {
    const url = (video as { url?: unknown }).url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  if (typeof result.video_url === 'string' && result.video_url.trim()) {
    return result.video_url.trim();
  }
  return null;
}
