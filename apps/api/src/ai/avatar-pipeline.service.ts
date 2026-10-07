import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientsRepository } from '@cm/db';
import { MediaStorageService } from '../media/media-storage.service';
import { parseClientBrand } from './composition/brand-layout';
import { LIPSYNC_PROVIDER, TTS_PROVIDER } from './ai.tokens';
import type { LipSyncProvider } from './interfaces/lipsync-provider.interface';
import type { TtsProvider } from './interfaces/tts-provider.interface';
import { ScriptService } from './script/script.service';
import type { SubtitleCue } from './video-composition/video-composition.service';
import { VideoCompositionService } from './video-composition/video-composition.service';

export type AvatarPipelineInput = {
  agencyId: string;
  clientId: string;
  brief: string;
  caption: string;
  referenceText?: string;
  /** Override del personaje (si no, clients.brand.characterImageUrl). */
  characterImageUrl?: string;
  voiceId?: string;
  targetSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
};

export type AvatarPipelineResult = {
  url: string;
  width: number;
  height: number;
  model: string;
  ttsProvider: 'elevenlabs' | 'mock' | 'unknown';
  lipsyncProvider: 'fal' | 'mock' | 'unknown';
  usedMock: boolean;
  musicTrackId?: string;
  burnedSubtitles: boolean;
  durationSeconds?: number;
  spokenTextPreview: string;
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

    const avatarScript = await this.script.buildAvatarScript({
      brief: input.brief,
      caption: input.caption,
      referenceText: input.referenceText,
      targetSeconds: input.targetSeconds ?? 20,
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

    const clip = await this.loadClipBuffer(animated.url);
    const duration = await this.composition.probeClipDuration(clip);
    const subtitles = this.buildSubtitleCues(
      avatarScript.subtitleLines,
      duration,
      input.withSubtitles !== false,
    );

    const composed = await this.composition.concatClips({
      clips: [clip],
      subtitles,
      burnSubtitles: input.withSubtitles !== false,
      withMusic: input.withMusic !== false,
      musicTrackId: input.musicTrackId,
      musicSuggestion: avatarScript.musicSuggestion,
      musicVolume: 0.12,
    });

    const stored = await this.mediaStorage.save({
      agencyId: input.agencyId,
      buffer: composed.buffer,
      extension: 'mp4',
      contentType: 'video/mp4',
    });

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
    };
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

  private async loadClipBuffer(url: string): Promise<Buffer> {
    try {
      const fromStorage = await this.mediaStorage.readBytesFromUrl(url);
      return fromStorage.buffer;
    } catch {
      return this.composition.downloadClip(url);
    }
  }
}
