import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStorageService } from '../media/media-storage.service';
import { IMAGE_PROVIDER, VIDEO_PROVIDER } from './ai.tokens';
import type { ImageProvider } from './interfaces/image-provider.interface';
import type { VideoProvider } from './interfaces/video-provider.interface';
import { ScriptService } from './script/script.service';
import {
  sceneCountFromTargetDuration,
} from './video-composition/licensed-music';
import {
  VideoCompositionService,
  type SubtitleCue,
} from './video-composition/video-composition.service';

export type ReelPipelineInput = {
  agencyId: string;
  brief: string;
  caption: string;
  hashtags?: string[];
  referenceText?: string;
  /** Foto manual: keyframe de la primera escena (estilo/ancla). */
  referenceImageUrl?: string;
  sceneCount?: number;
  /** Duración objetivo en segundos → nº de escenas. */
  targetDurationSeconds?: number;
  musicTrackId?: string;
  withMusic?: boolean;
  withSubtitles?: boolean;
};

export type ReelPipelineResult = {
  url: string;
  width: number;
  height: number;
  model: string;
  provider: 'fal' | 'mock' | 'unknown';
  usedMock: boolean;
  sceneCount: number;
  multiScene: boolean;
  musicSuggestion?: string;
  musicTrackId?: string;
  burnedSubtitles: boolean;
  durationSeconds?: number;
  sceneModels: string[];
};

@Injectable()
export class ReelPipelineService {
  private readonly logger = new Logger(ReelPipelineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly script: ScriptService,
    private readonly composition: VideoCompositionService,
    private readonly mediaStorage: MediaStorageService,
    @Inject(IMAGE_PROVIDER) private readonly image: ImageProvider,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
  ) {}

  async generate(input: ReelPipelineInput): Promise<ReelPipelineResult> {
    if (!this.isMultiSceneEnabled()) {
      return this.generateSingle(input);
    }
    return this.generateMultiScene(input);
  }

  private isMultiSceneEnabled(): boolean {
    const flag = this.config.get<string>('REEL_MULTI_SCENE')?.trim().toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') return false;
    return true;
  }

  private resolveSceneCount(input: ReelPipelineInput): number | undefined {
    if (input.sceneCount != null) return input.sceneCount;
    return sceneCountFromTargetDuration(input.targetDurationSeconds);
  }

  private async generateSingle(input: ReelPipelineInput): Promise<ReelPipelineResult> {
    let referenceImageUrl = input.referenceImageUrl?.trim();
    if (!referenceImageUrl) {
      const keyframe = await this.image.generateImage({
        brief: input.brief,
        caption: input.caption,
        hashtags: input.hashtags,
        referenceText: input.referenceText,
        imageSize: '1024x1792',
        agencyId: input.agencyId,
      });
      referenceImageUrl = keyframe.url;
      this.logger.log(`Keyframe único generado (${keyframe.provider})`);
    }

    const generated = await this.video.generateVideo({
      prompt: input.brief,
      caption: input.caption,
      hashtags: input.hashtags,
      referenceText: input.referenceText,
      referenceImageUrl,
      agencyId: input.agencyId,
    });

    const clip = await this.loadClipBuffer(generated.url);
    const duration = await this.composition.probeClipDuration(clip);
    const subtitleText = input.caption.trim().slice(0, 72);
    const subtitles: SubtitleCue[] =
      input.withSubtitles === false || !subtitleText
        ? []
        : [{ startSeconds: 0.2, endSeconds: Math.max(1, duration - 0.2), text: subtitleText }];

    const composed = await this.composition.concatClips({
      clips: [clip],
      subtitles,
      burnSubtitles: input.withSubtitles !== false,
      withMusic: input.withMusic !== false,
      musicTrackId: input.musicTrackId,
      musicSuggestion: 'upbeat light',
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
      model: generated.model ?? generated.provider ?? 'video',
      provider: generated.provider ?? 'unknown',
      usedMock: generated.provider === 'mock',
      sceneCount: 1,
      multiScene: false,
      musicTrackId: composed.musicTrackId,
      burnedSubtitles: composed.burnedSubtitles,
      durationSeconds: composed.durationSeconds,
      sceneModels: [generated.model ?? 'unknown'],
    };
  }

  private async generateMultiScene(input: ReelPipelineInput): Promise<ReelPipelineResult> {
    const script = await this.script.buildReelScript({
      brief: input.brief,
      caption: input.caption,
      referenceText: input.referenceText,
      sceneCount: this.resolveSceneCount(input),
    });

    this.logger.log(`Guion Reel: ${script.scenes.length} escenas`);

    const clipBuffers: Buffer[] = [];
    const sceneModels: string[] = [];
    const sceneDurations: number[] = [];
    let anyMock = false;
    let lastProvider: 'fal' | 'mock' | 'unknown' = 'unknown';

    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      let keyframeUrl: string | undefined;

      if (i === 0 && input.referenceImageUrl?.trim()) {
        keyframeUrl = input.referenceImageUrl.trim();
      } else {
        const keyframe = await this.image.generateImage({
          brief: scene.visualPrompt,
          caption: input.caption,
          hashtags: input.hashtags,
          referenceText: input.referenceText,
          imageSize: '1024x1792',
          agencyId: input.agencyId,
        });
        keyframeUrl = keyframe.url;
        if (keyframe.provider === 'mock') anyMock = true;
      }

      const clip = await this.video.generateVideo({
        prompt: scene.motionPrompt,
        caption: input.caption,
        hashtags: input.hashtags,
        referenceImageUrl: keyframeUrl,
        agencyId: input.agencyId,
      });
      sceneModels.push(clip.model ?? 'unknown');
      lastProvider = clip.provider ?? 'unknown';
      if (clip.provider === 'mock') anyMock = true;

      const buffer = await this.loadClipBuffer(clip.url);
      clipBuffers.push(buffer);
      const dur = await this.composition.probeClipDuration(buffer);
      sceneDurations.push(dur > 0 ? dur : scene.durationHintSeconds || 5);
      this.logger.log(`Escena ${scene.id}: clip listo (${clip.model}, ${dur.toFixed(1)}s)`);
    }

    const subtitles = this.buildSubtitleCues(
      script.scenes.map((s) => s.subtitle),
      sceneDurations,
      input.caption,
      input.withSubtitles !== false,
    );

    const composed = await this.composition.concatClips({
      clips: clipBuffers,
      subtitles,
      burnSubtitles: input.withSubtitles !== false,
      withMusic: input.withMusic !== false,
      musicTrackId: input.musicTrackId,
      musicSuggestion: script.musicSuggestion,
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
      model: sceneModels.join('+'),
      provider: lastProvider,
      usedMock: anyMock,
      sceneCount: script.scenes.length,
      multiScene: true,
      musicSuggestion: script.musicSuggestion,
      musicTrackId: composed.musicTrackId,
      burnedSubtitles: composed.burnedSubtitles,
      durationSeconds: composed.durationSeconds,
      sceneModels,
    };
  }

  buildSubtitleCues(
    sceneSubtitles: string[],
    durations: number[],
    captionFallback: string,
    enabled: boolean,
  ): SubtitleCue[] {
    if (!enabled) return [];
    const cues: SubtitleCue[] = [];
    let t = 0;
    for (let i = 0; i < durations.length; i++) {
      const dur = durations[i] ?? 5;
      const text =
        (sceneSubtitles[i] ?? '').trim() ||
        (i === 0 ? captionFallback.trim().slice(0, 72) : '');
      if (text) {
        cues.push({
          startSeconds: t + 0.15,
          endSeconds: t + Math.max(0.8, dur - 0.2),
          text,
        });
      }
      t += dur;
    }
    return cues;
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
