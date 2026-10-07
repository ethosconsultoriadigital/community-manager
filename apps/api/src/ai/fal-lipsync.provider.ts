import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStorageService } from '../media/media-storage.service';
import { runFalQueueJob } from './fal-queue';
import type {
  LipSyncInput,
  LipSyncProvider,
  LipSyncResult,
} from './interfaces/lipsync-provider.interface';

/**
 * Por defecto SadTalker: imagen + audio (apto para personajes estilizados).
 * `fal-ai/live-portrait` NO sirve aquí (pide video_url, no audio).
 */
const DEFAULT_MODEL = 'fal-ai/sadtalker';

@Injectable()
export class FalLipSyncProvider implements LipSyncProvider {
  private readonly logger = new Logger(FalLipSyncProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async animate(input: LipSyncInput): Promise<LipSyncResult> {
    const apiKey = this.config.get<string>('FAL_KEY')?.trim();
    if (!apiKey) {
      throw new BadRequestException('Falta FAL_KEY para lip-sync');
    }
    if (!input.characterImageUrl?.trim() || !input.audioUrl?.trim()) {
      throw new BadRequestException(
        'characterImageUrl y audioUrl son obligatorios para lip-sync',
      );
    }
    if (!input.agencyId) {
      throw new BadRequestException('agencyId es obligatorio');
    }

    const model =
      this.config.get<string>('FAL_LIPSYNC_MODEL')?.trim() || DEFAULT_MODEL;
    const imageUrl = input.characterImageUrl.trim();
    const audioUrl = input.audioUrl.trim();
    const body = buildLipSyncBody(model, imageUrl, audioUrl);

    const result = await runFalQueueJob({
      apiKey,
      model,
      body,
      logger: this.logger,
      failLabel: 'lip-sync',
    });

    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) {
      throw new BadRequestException('fal lip-sync no devolvió URL de video');
    }

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new BadRequestException(
        `No se pudo descargar el video lip-sync (${response.status})`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
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
      provider: 'fal',
      model,
    };
  }
}

export function buildLipSyncBody(
  model: string,
  imageUrl: string,
  audioUrl: string,
): Record<string, unknown> {
  const id = model.toLowerCase();
  if (id.includes('sadtalker')) {
    return {
      source_image_url: imageUrl,
      driven_audio_url: audioUrl,
      preprocess: 'crop',
      face_model_resolution: '256',
    };
  }
  // fal-ai/live-avatar y similares
  return {
    image_url: imageUrl,
    audio_url: audioUrl,
  };
}

function extractVideoUrl(result: Record<string, unknown>): string | null {
  const video = result.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  if (typeof result.video_url === 'string') return result.video_url;
  const data = result.data as { video?: { url?: string } } | undefined;
  if (data?.video?.url) return data.video.url;
  return null;
}
