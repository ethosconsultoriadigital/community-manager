import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from '../media/media-storage.service';
import { IMAGE_PROVIDER, VIDEO_PROVIDER } from './ai.tokens';
import type { ImageProvider } from './interfaces/image-provider.interface';
import type { VideoProvider } from './interfaces/video-provider.interface';
import { ScriptService } from './script/script.service';
import {
  capVideoSeconds,
  clipSecondsForScenes,
  maxScenesForDuration,
} from './video-duration';
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
  /** 1 escena de 10 s (default, más barato) o 2 de 5 s. */
  sceneCount?: number;
  /** Duración total en segundos; nunca pasa de VIDEO_MAX_SECONDS (10). */
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

  /** Tope de escenas: REEL_MAX_SCENES (default 2, 512 MB) y que cada una dure ≥5 s dentro del tope. */
  private maxScenes(): number {
    const raw = Number(this.config.get<string>('REEL_MAX_SCENES') ?? '2');
    const fromEnv = Number.isFinite(raw) ? Math.min(4, Math.max(1, Math.round(raw))) : 2;
    return Math.min(fromEnv, maxScenesForDuration());
  }

  /** Default 1 escena (un solo keyframe + un clip = lo más barato), o REEL_SCENE_COUNT. */
  resolveSceneCount(input: ReelPipelineInput): number {
    const max = this.maxScenes();
    const fromEnv = Number(this.config.get<string>('REEL_SCENE_COUNT') ?? '');
    const requested =
      input.sceneCount != null && Number.isFinite(input.sceneCount) && input.sceneCount > 0
        ? input.sceneCount
        : Number.isFinite(fromEnv) && fromEnv > 0
          ? fromEnv
          : 1;
    return Math.min(max, Math.max(1, Math.round(requested)));
  }

  /** Duración total del Reel (≤ VIDEO_MAX_SECONDS). */
  totalSeconds(input: ReelPipelineInput): number {
    return capVideoSeconds(input.targetDurationSeconds);
  }

  private async generateSingle(input: ReelPipelineInput): Promise<ReelPipelineResult> {
    const total = this.totalSeconds(input);
    let referenceImageUrl = input.referenceImageUrl?.trim();
    if (!referenceImageUrl) {
      const keyframe = await this.image.generateImage({
        brief: input.brief,
        caption: input.caption,
        hashtags: input.hashtags,
        referenceText: input.referenceText,
        imageSize: '720x1280',
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
      durationSeconds: total,
    });

    const workDir = await mkdtemp(join(tmpdir(), 'cm-reel-pipe-'));
    try {
      const clipPath = join(workDir, 'clip-0.mp4');
      await this.composition.downloadClipToFile(generated.url, clipPath);
      const duration = Math.min(
        total,
        await this.composition.probeClipDurationFromPath(clipPath),
      );
      const subtitleText = input.caption.trim().slice(0, 72);
      const subtitles: SubtitleCue[] =
        input.withSubtitles === false || !subtitleText
          ? []
          : [
              {
                startSeconds: 0.2,
                endSeconds: Math.max(1, duration - 0.2),
                text: subtitleText,
              },
            ];

      const composed = await this.composition.concatClips({
        clipPaths: [clipPath],
        subtitles,
        burnSubtitles: input.withSubtitles !== false,
        withMusic: input.withMusic !== false,
        musicTrackId: input.musicTrackId,
        musicSuggestion: 'upbeat light',
        maxDurationSeconds: total,
        keepOnDisk: true,
      });
      if (!composed.outPath) {
        throw new Error('Composición sin outPath');
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
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async generateMultiScene(input: ReelPipelineInput): Promise<ReelPipelineResult> {
    const total = this.totalSeconds(input);
    const script = await this.script.buildReelScript({
      brief: input.brief,
      caption: input.caption,
      referenceText: input.referenceText,
      sceneCount: this.resolveSceneCount(input),
    });

    const clipSeconds = clipSecondsForScenes(script.scenes.length, total);
    this.logger.log(
      `Guion Reel: ${script.scenes.length} escenas x ${clipSeconds}s (max=${this.maxScenes()}, tope ${total}s)`,
    );

    const workDir = await mkdtemp(join(tmpdir(), 'cm-reel-pipe-'));
    const clipPaths: string[] = [];
    const sceneModels: string[] = [];
    const sceneDurations: number[] = [];
    let anyMock = false;
    let lastProvider: 'fal' | 'mock' | 'unknown' = 'unknown';

    try {
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
            imageSize: '720x1280',
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
          durationSeconds: clipSeconds,
        });
        sceneModels.push(clip.model ?? 'unknown');
        lastProvider = clip.provider ?? 'unknown';
        if (clip.provider === 'mock') anyMock = true;

        const clipPath = join(workDir, `clip-${i}.mp4`);
        await this.composition.downloadClipToFile(clip.url, clipPath);
        clipPaths.push(clipPath);
        const dur = await this.composition.probeClipDurationFromPath(clipPath);
        sceneDurations.push(dur > 0 ? dur : clipSeconds);
        this.logger.log(`Escena ${scene.id}: clip en disco (${clip.model}, ${dur.toFixed(1)}s)`);
      }

      const subtitles = this.buildSubtitleCues(
        script.scenes.map((s) => s.subtitle),
        sceneDurations,
        input.caption,
        input.withSubtitles !== false,
        total,
      );

      const composed = await this.composition.concatClips({
        clipPaths,
        subtitles,
        burnSubtitles: input.withSubtitles !== false,
        withMusic: input.withMusic !== false,
        musicTrackId: input.musicTrackId,
        musicSuggestion: script.musicSuggestion,
        maxDurationSeconds: total,
        keepOnDisk: true,
      });
      if (!composed.outPath) {
        throw new Error('Composición sin outPath');
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
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  buildSubtitleCues(
    sceneSubtitles: string[],
    durations: number[],
    captionFallback: string,
    enabled: boolean,
    maxSeconds = Number.POSITIVE_INFINITY,
  ): SubtitleCue[] {
    if (!enabled) return [];
    const cues: SubtitleCue[] = [];
    let t = 0;
    for (let i = 0; i < durations.length; i++) {
      if (t + 0.15 >= maxSeconds - 0.3) break;
      const dur = durations[i] ?? 5;
      const text =
        (sceneSubtitles[i] ?? '').trim() ||
        (i === 0 ? captionFallback.trim().slice(0, 72) : '');
      if (text) {
        cues.push({
          startSeconds: t + 0.15,
          endSeconds: Math.min(maxSeconds - 0.1, t + Math.max(0.8, dur - 0.2)),
          text,
        });
      }
      t += dur;
    }
    return cues;
  }
}
