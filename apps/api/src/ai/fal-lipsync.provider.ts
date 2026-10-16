import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from '../media/media-storage.service';
import { downloadUrlToFile } from './download-to-file';
import { extractFalVideoUrl } from './fal-video-request';
import { runFalQueueJob } from './fal-queue';
import type {
  LipSyncInput,
  LipSyncProvider,
  LipSyncResult,
} from './interfaces/lipsync-provider.interface';

/**
 * Sync-3: imagen + audio; documentado para ilustraciones / frames animados
 * (personajes cartoon), no solo fotos reales.
 * SadTalker sigue disponible vía FAL_LIPSYNC_MODEL o como fallback.
 */
export const DEFAULT_LIPSYNC_MODEL = 'fal-ai/sync-lipsync/v3/image-to-video';
export const KLING_AVATAR_MODEL = 'fal-ai/kling-video/v1/standard/ai-avatar';
const STYLIZED_FALLBACK_MODEL = 'fal-ai/sync-lipsync/v3/image-to-video';

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

    const resolved = resolveAvatarModel(
      this.config.get<string>('AVATAR_PROVIDER'),
      this.config.get<string>('FAL_LIPSYNC_MODEL'),
    );
    const primary = resolved.model;
    if (resolved.remappedFrom) {
      this.logger.warn(
        `FAL_LIPSYNC_MODEL=${resolved.remappedFrom} está obsoleto para ilustraciones; se usa ${primary}. Borra la variable en Render.`,
      );
    }
    const imageUrl = input.characterImageUrl.trim();
    const audioUrl = input.audioUrl.trim();

    try {
      return await this.runModel(apiKey, primary, imageUrl, audioUrl, input.agencyId);
    } catch (error) {
      const id = primary.toLowerCase();
      const canFallback =
        !id.includes('sync-lipsync') &&
        !id.includes('kling-video') &&
        !id.includes('ai-avatar') &&
        primary !== STYLIZED_FALLBACK_MODEL;
      if (!canFallback) {
        throw mapLipSyncError(error);
      }

      this.logger.warn(
        `Lip-sync ${primary} falló (${error instanceof Error ? error.message : error}); reintentando con ${STYLIZED_FALLBACK_MODEL}`,
      );
      try {
        return await this.runModel(
          apiKey,
          STYLIZED_FALLBACK_MODEL,
          imageUrl,
          audioUrl,
          input.agencyId,
        );
      } catch (fallbackError) {
        throw mapLipSyncError(fallbackError);
      }
    }
  }

  private async runModel(
    apiKey: string,
    model: string,
    imageUrl: string,
    audioUrl: string,
    agencyId: string,
  ): Promise<LipSyncResult> {
    const body = buildLipSyncBody(model, imageUrl, audioUrl);
    const result = await runFalQueueJob({
      apiKey,
      model,
      body,
      logger: this.logger,
      failLabel: 'lip-sync',
    });

    const videoUrl = extractFalVideoUrl(result);
    if (!videoUrl) {
      throw new BadRequestException('fal lip-sync no devolvió URL de video');
    }

    const workDir = await mkdtemp(join(tmpdir(), 'cm-fal-lipsync-'));
    try {
      const localPath = join(workDir, 'lipsync.mp4');
      await downloadUrlToFile(videoUrl, localPath);
      const stored = await this.mediaStorage.saveFromFile({
        agencyId,
        filePath: localPath,
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
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        err instanceof Error ? err.message : 'No se pudo guardar el video lip-sync',
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * AVATAR_PROVIDER=kling usa Kling AI Avatar (imagen + audio).
 * Vacío, sync o lipsync deja Sync-3, el default.
 */
export function resolveAvatarModel(
  avatarProvider: string | undefined,
  lipsyncModel: string | undefined,
): { model: string; remappedFrom?: string } {
  const mode = avatarProvider?.trim().toLowerCase() ?? '';
  if (!mode || mode === 'sync' || mode === 'lipsync' || mode === 'fal') {
    return resolveLipSyncModel(lipsyncModel);
  }
  if (mode === 'kling') return { model: KLING_AVATAR_MODEL };
  throw new BadRequestException(
    `AVATAR_PROVIDER=${avatarProvider?.trim()} no es válido. Usa sync (default) o kling.`,
  );
}

/** SadTalker falla con personajes 3D/cartoon. Se ignora salvo FAL_ALLOW_LEGACY_LIPSYNC=true. */
export function resolveLipSyncModel(configured: string | undefined): {
  model: string;
  remappedFrom?: string;
} {
  const raw = configured?.trim();
  if (!raw) return { model: DEFAULT_LIPSYNC_MODEL };
  if (
    raw.toLowerCase().includes('sadtalker') &&
    process.env.FAL_ALLOW_LEGACY_LIPSYNC !== 'true'
  ) {
    return { model: DEFAULT_LIPSYNC_MODEL, remappedFrom: raw };
  }
  return { model: raw };
}

export function buildLipSyncBody(
  model: string,
  imageUrl: string,
  audioUrl: string,
): Record<string, unknown> {
  const id = model.toLowerCase();
  if (id.includes('kling') || id.includes('ai-avatar')) {
    return {
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: '.',
    };
  }
  if (id.includes('sadtalker')) {
    return {
      source_image_url: imageUrl,
      driven_audio_url: audioUrl,
      // full: mejor con bust/retrato cartoon que crop agresivo
      preprocess: 'full',
      face_model_resolution: '256',
      still: true,
    };
  }
  // sync-lipsync/v3/image-to-video, live-avatar, etc.
  return {
    image_url: imageUrl,
    audio_url: audioUrl,
  };
}

export function isFaceDetectionError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return (
    msg.includes('no face detected') ||
    msg.includes('face not detected') ||
    msg.includes('could not detect') ||
    msg.includes('no face') ||
    msg.includes('facial landmark')
  );
}

export function mapLipSyncError(error: unknown): Error {
  if (isFaceDetectionError(error)) {
    return new BadRequestException(
      'No se detectó una cara usable en la imagen del personaje. Usa un retrato frontal con ojos, nariz y boca claros (vale cartoon/3D). Evita perfiles extremos, gafas muy opacas o recortes sin cara.',
    );
  }
  if (error instanceof Error) return error;
  return new BadRequestException(String(error));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

