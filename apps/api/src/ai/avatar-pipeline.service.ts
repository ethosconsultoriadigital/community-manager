import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientsRepository } from '@cm/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from '../media/media-storage.service';
import {
  DEFAULT_AVATAR_TEMPLATE,
  extractBrandColorsFromLogo,
  normalizeAvatarTemplate,
  resolveBrandColors,
  displayWebsite,
  type AvatarTemplate,
  type BrandColors,
} from './composition/brand-kit';
import { parseClientBrand, type ClientBrandConfig } from './composition/brand-layout';
import { headlineFromCaption } from './composition/overlay-text';
import { LIPSYNC_PROVIDER, TTS_PROVIDER } from './ai.tokens';
import type { LipSyncProvider } from './interfaces/lipsync-provider.interface';
import type { TtsProvider } from './interfaces/tts-provider.interface';
import { ScriptService } from './script/script.service';
import {
  buildAvatarAss,
  endCardSecondsFor,
  renderAvatarTemplateLayers,
  wordCuesFromLines,
  type DesignedAvatarTemplate,
} from './video-composition/avatar-template';
import type {
  ConcatClipsResult,
  SubtitleCue,
} from './video-composition/video-composition.service';
import { VideoCompositionService } from './video-composition/video-composition.service';
import { capVideoSeconds } from './video-duration';

/** Título del video: corto, sin emojis (mismo criterio que la foto con logo). */
const AVATAR_TITLE_MAX_CHARS = 60;

export type AvatarPipelineInput = {
  agencyId: string;
  clientId: string;
  brief: string;
  caption: string;
  referenceText?: string;
  /** Override del personaje (si no, clients.brand.characterImageUrl). */
  characterImageUrl?: string;
  voiceId?: string;
  /** Segundos máximos del monólogo; nunca pasa de VIDEO_MAX_SECONDS (10). */
  targetSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
  /**
   * Plantilla de presentación: clasica (como antes) | profesional | circulo | dividido.
   * Si no viene: clients.brand.videoTemplate y si no, profesional.
   */
  template?: string;
};

export type AvatarPipelineResult = {
  url: string;
  width: number;
  height: number;
  model: string;
  ttsProvider: 'elevenlabs' | 'fal' | 'mock' | 'unknown';
  lipsyncProvider: 'fal' | 'mock' | 'unknown';
  usedMock: boolean;
  musicTrackId?: string;
  burnedSubtitles: boolean;
  durationSeconds?: number;
  spokenTextPreview: string;
  /** Plantilla que se aplicó de verdad ('clasica' si hubo que volver al diseño anterior). */
  template: AvatarTemplate;
  /** Clip limpio del lip-sync en R2 (sin subtítulos) para re-componer sin pagar fal. */
  cleanClipUrl?: string;
};

@Injectable()
export class AvatarPipelineService {
  private readonly logger = new Logger(AvatarPipelineService.name);

  constructor(
    private readonly clients: ClientsRepository,
    private readonly script: ScriptService,
    private readonly composition: VideoCompositionService,
    private readonly mediaStorage: MediaStorageService,
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider,
    @Inject(LIPSYNC_PROVIDER) private readonly lipsync: LipSyncProvider,
  ) {}

  async generate(input: AvatarPipelineInput): Promise<AvatarPipelineResult> {
    const client = await this.clients.findById(input.agencyId, input.clientId);
    if (!client) {
      throw new BadRequestException('Cliente no encontrado');
    }
    const brand = parseClientBrand(client.brand);
    const characterImageUrl =
      input.characterImageUrl?.trim() || brand.characterImageUrl;
    if (!characterImageUrl) {
      throw new BadRequestException(
        'Falta la imagen del personaje. Adjunta un personaje de marca antes de generar el avatar.',
      );
    }

    const maxSeconds = capVideoSeconds(input.targetSeconds);
    const avatarScript = await this.script.buildAvatarScript({
      brief: input.brief,
      caption: input.caption,
      referenceText: input.referenceText,
      targetSeconds: maxSeconds,
    });
    this.logger.log(
      `Avatar guion: ${avatarScript.spokenText.length} chars, ${avatarScript.subtitleLines.length} líneas`,
    );

    const speech = await this.tts.synthesize({
      text: avatarScript.spokenText,
      voiceId: input.voiceId?.trim() || brand.ttsVoiceId,
    });
    const audioStored = await this.mediaStorage.save({
      agencyId: input.agencyId,
      buffer: speech.buffer,
      extension: speech.extension,
      contentType: speech.contentType,
    });

    const animated = await this.lipsync.animate({
      characterImageUrl,
      audioUrl: audioStored.storageUrl,
      agencyId: input.agencyId,
    });

    const workDir = await mkdtemp(join(tmpdir(), 'cm-avatar-pipe-'));
    try {
      const clipPath = join(workDir, 'clip.mp4');
      await this.composition.downloadClipToFile(animated.url, clipPath);
      const duration = Math.min(
        maxSeconds,
        await this.composition.probeClipDurationFromPath(clipPath),
      );
      const subtitles = this.buildSubtitleCues(
        avatarScript.subtitleLines,
        duration,
        input.withSubtitles !== false,
      );

      // Clip limpio a R2 (aditivo: si falla, el avatar sigue igual).
      const cleanClipUrl = await this.saveCleanClip(input.agencyId, clipPath);

      const requested: AvatarTemplate =
        normalizeAvatarTemplate(input.template) ?? brand.videoTemplate ?? DEFAULT_AVATAR_TEMPLATE;
      let usedTemplate: AvatarTemplate = 'clasica';
      let composed: ConcatClipsResult | null = null;
      if (requested !== 'clasica') {
        try {
          composed = await this.composeWithTemplate({
            template: requested,
            agencyId: input.agencyId,
            brand,
            caption: input.caption,
            clipPath,
            mainSeconds: duration,
            maxSeconds,
            subtitles,
            withMusic: input.withMusic !== false,
            musicTrackId: input.musicTrackId,
            musicSuggestion: avatarScript.musicSuggestion,
          });
          usedTemplate = requested;
        } catch (err) {
          this.logger.warn(
            `Plantilla de avatar "${requested}" falló; se usa la composición clásica: ${
              err instanceof Error ? err.message : err
            }`,
          );
          composed = null;
        }
      }

      if (!composed) {
        composed = await this.composition.concatClips({
          clipPaths: [clipPath],
          subtitles,
          burnSubtitles: input.withSubtitles !== false,
          withMusic: input.withMusic !== false,
          musicTrackId: input.musicTrackId,
          musicSuggestion: avatarScript.musicSuggestion,
          musicVolume: 0.12,
          // La voz viene en el clip del lip-sync: se conserva y se recorta al tope.
          keepClipAudio: true,
          maxDurationSeconds: maxSeconds,
          keepOnDisk: true,
        });
      }
      if (!composed.outPath) {
        throw new BadRequestException('Composición de avatar sin archivo de salida');
      }

      const stored = await this.mediaStorage.saveFromFile({
        agencyId: input.agencyId,
        filePath: composed.outPath,
        extension: 'mp4',
        contentType: 'video/mp4',
      });
      await this.composition.cleanupWorkDir(composed.workDir);

      return {
        url: stored.storageUrl,
        width: composed.width,
        height: composed.height,
        model: `${speech.model ?? speech.provider}+${animated.model ?? animated.provider}`,
        ttsProvider: speech.provider,
        lipsyncProvider: animated.provider,
        usedMock: speech.provider === 'mock' || animated.provider === 'mock',
        musicTrackId: composed.musicTrackId,
        burnedSubtitles: composed.burnedSubtitles,
        durationSeconds: composed.durationSeconds,
        spokenTextPreview: avatarScript.spokenText.slice(0, 160),
        template: usedTemplate,
        ...(cleanClipUrl ? { cleanClipUrl } : {}),
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async saveCleanClip(agencyId: string, clipPath: string): Promise<string | undefined> {
    try {
      const stored = await this.mediaStorage.saveFromFile({
        agencyId,
        filePath: clipPath,
        extension: 'mp4',
        contentType: 'video/mp4',
      });
      return stored?.storageUrl;
    } catch (err) {
      this.logger.warn(
        `No se pudo guardar el clip limpio del avatar (se sigue igual): ${
          err instanceof Error ? err.message : err
        }`,
      );
      return undefined;
    }
  }

  /** Logo para fondo oscuro si existe; si no, el logo normal. Nunca se modifica. */
  private async loadLogo(brand: ClientBrandConfig): Promise<Buffer | null> {
    const url = brand.logoDarkUrl || brand.logoUrl;
    if (!url) return null;
    try {
      const { buffer } = await this.mediaStorage.readBytesFromUrl(url);
      return buffer?.length ? buffer : null;
    } catch (err) {
      this.logger.warn(
        `No se pudo leer el logo para la plantilla (va sin logo): ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async brandColors(brand: ClientBrandConfig, logo: Buffer | null): Promise<BrandColors> {
    const kit = brand.colors;
    const complete = Boolean(kit?.dark && kit.primary && kit.accent);
    let fromLogo: BrandColors | null = null;
    if (!complete && logo) {
      try {
        fromLogo = await extractBrandColorsFromLogo(logo);
      } catch {
        fromLogo = null;
      }
    }
    return resolveBrandColors(kit, fromLogo);
  }

  private async composeWithTemplate(input: {
    template: DesignedAvatarTemplate;
    agencyId: string;
    brand: ClientBrandConfig;
    caption: string;
    clipPath: string;
    mainSeconds: number;
    maxSeconds: number;
    subtitles: SubtitleCue[];
    withMusic: boolean;
    musicTrackId?: string;
    musicSuggestion?: string;
  }): Promise<ConcatClipsResult> {
    const { brand } = input;
    const logo = await this.loadLogo(brand);
    const colors = await this.brandColors(brand, logo);
    const website = displayWebsite(brand.website);
    const title = headlineFromCaption(input.caption, AVATAR_TITLE_MAX_CHARS);
    const layers = await renderAvatarTemplateLayers({
      template: input.template,
      colors,
      logo,
      title,
      website,
      ctaText: brand.ctaText,
      fontTitle: brand.fontTitle,
      fontBody: brand.fontBody,
    });
    const endCardSeconds = endCardSecondsFor(input.mainSeconds, input.maxSeconds);
    const ass = buildAvatarAss({
      template: input.template,
      colors,
      fontTitle: brand.fontTitle,
      fontBody: brand.fontBody,
      titleLines: layers.titleLines,
      titleSize: layers.titleSize,
      website,
      ctaText: brand.ctaText,
      words: wordCuesFromLines(input.subtitles),
      mainSeconds: input.mainSeconds,
      endCardSeconds,
    });
    const composed = await this.composition.composeAvatarTemplate({
      clipPath: input.clipPath,
      layers,
      ass,
      mainSeconds: input.mainSeconds,
      endCardSeconds,
      withMusic: input.withMusic,
      musicTrackId: input.musicTrackId,
      musicSuggestion: input.musicSuggestion,
      musicVolume: 0.12,
    });
    if (!composed?.outPath) {
      throw new Error('La plantilla no devolvió archivo de salida');
    }
    return composed;
  }

  buildSubtitleCues(
    lines: string[],
    totalDuration: number,
    enabled: boolean,
  ): SubtitleCue[] {
    if (!enabled || !lines.length) return [];
    const slice = Math.max(1.2, totalDuration / lines.length);
    return lines.map((text, i) => ({
      startSeconds: i * slice + 0.1,
      endSeconds: Math.min(totalDuration - 0.1, (i + 1) * slice - 0.1),
      text: text.slice(0, 72),
    }));
  }

}
