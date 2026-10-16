import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from '../media/media-storage.service';
import { buildVideoPrompt } from './build-video-prompt';
import { downloadUrlToFile } from './download-to-file';
import { runFalQueueJob } from './fal-queue';
import {
  buildFalVideoBody,
  extractFalVideoUrl,
  resolveFalVideoModel,
} from './fal-video-request';
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoProvider,
} from './interfaces/video-provider.interface';

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
    const configured = hasImage
      ? this.config.get<string>('FAL_IMAGE_TO_VIDEO_MODEL')
      : this.config.get<string>('FAL_VIDEO_MODEL');
    const resolved = resolveFalVideoModel(configured, hasImage);
    const model = resolved.model;
    if (resolved.remappedFrom) {
      const legacy = /video-01/i.test(resolved.remappedFrom);
      this.logger.warn(
        legacy
          ? `Modelo fal obsoleto ${resolved.remappedFrom} → ${model}. Quita FAL_VIDEO_MODEL / FAL_IMAGE_TO_VIDEO_MODEL o déjalos en Hailuo 02.`
          : `Modelo fal ${resolved.remappedFrom} → ${model}`,
      );
    }

    const falInput = buildFalVideoBody(
      model,
      prompt,
      hasImage ? input.referenceImageUrl!.trim() : undefined,
    );

    const result = await runFalQueueJob({
      apiKey,
      model,
      body: falInput,
      logger: this.logger,
      failLabel: 'Reel',
    });

    const videoUrl = extractFalVideoUrl(result);
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

