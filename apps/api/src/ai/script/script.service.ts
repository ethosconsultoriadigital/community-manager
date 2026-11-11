import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from '../ai.tokens';
import type { LlmProvider } from '../interfaces/llm-provider.interface';
import type { ReelScript } from './reel-script.types';
import { capVideoSeconds, maxSpokenWords, trimSpokenText } from '../video-duration';

const MIN_SCENES = 1;
const MAX_SCENES = 4;
const DEFAULT_SCENES = 2;

@Injectable()
export class ScriptService {
  constructor(
    private readonly config: ConfigService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Guion estructurado en escenas. Documentos/referencia van al LLM, no al modelo de video.
   */
  async buildReelScript(input: {
    brief: string;
    caption?: string;
    referenceText?: string;
    sceneCount?: number;
  }): Promise<ReelScript> {
    const sceneCount = this.resolveSceneCount(input.sceneCount);
    const result = await this.llm.generateReelScript({
      brief: input.brief.trim(),
      caption: input.caption?.trim(),
      referenceText: input.referenceText?.trim(),
      sceneCount,
    });

    const scenes = (result.scenes ?? [])
      .filter((s) => s.visualPrompt?.trim() && s.motionPrompt?.trim())
      .slice(0, sceneCount)
      .map((s, i) => ({
        id: s.id?.trim() || String(i + 1),
        visualPrompt: s.visualPrompt.trim(),
        motionPrompt: s.motionPrompt.trim(),
        subtitle: (s.subtitle ?? '').trim(),
        durationHintSeconds:
          Number.isFinite(s.durationHintSeconds) && s.durationHintSeconds > 0
            ? Math.min(10, Math.round(s.durationHintSeconds))
            : 5,
      }));

    if (scenes.length === 0) {
      return this.fallbackScript(input.brief, sceneCount);
    }

    while (scenes.length < sceneCount) {
      const n = scenes.length + 1;
      scenes.push({
        id: String(n),
        visualPrompt: `${input.brief.trim()}, escena ${n}, vertical 9:16`,
        motionPrompt: `Subtle cinematic motion continuing the story, scene ${n}`,
        subtitle: '',
        durationHintSeconds: 5,
      });
    }

    return {
      scenes,
      musicSuggestion: result.musicSuggestion?.trim() || undefined,
    };
  }

  resolveSceneCount(requested?: number): number {
    const fromEnv = Number(this.config.get<string>('REEL_SCENE_COUNT') ?? '');
    const base = Number.isFinite(requested) && requested
      ? Number(requested)
      : Number.isFinite(fromEnv) && fromEnv
        ? fromEnv
        : DEFAULT_SCENES;
    return Math.min(MAX_SCENES, Math.max(MIN_SCENES, Math.round(base)));
  }

  async buildAvatarScript(input: {
    brief: string;
    caption?: string;
    referenceText?: string;
    targetSeconds?: number;
  }): Promise<{
    spokenText: string;
    subtitleLines: string[];
    musicSuggestion?: string;
  }> {
    const seconds = capVideoSeconds(input.targetSeconds);
    const maxWords = maxSpokenWords(seconds);
    const result = await this.llm.generateAvatarScript({
      brief: input.brief.trim(),
      caption: input.caption?.trim(),
      referenceText: input.referenceText?.trim(),
      targetSeconds: seconds,
    });
    let spokenText = (result.spokenText ?? '').trim();
    if (!spokenText) {
      spokenText = `Hola, hoy te cuento sobre ${input.brief.trim()}. ${
        input.caption?.trim() ?? ''
      }`.trim();
    }
    // Tope duro: el monólogo cabe en ~10 s aunque el LLM se pase.
    const trimmed = trimSpokenText(spokenText, maxWords);
    const wasTrimmed = trimmed !== spokenText.split(/\s+/).filter(Boolean).join(' ');
    spokenText = trimmed;
    const subtitleLines =
      !wasTrimmed && result.subtitleLines?.length > 0
        ? result.subtitleLines.slice(0, 4)
        : splitSubtitleLines(spokenText);
    return {
      spokenText,
      subtitleLines,
      musicSuggestion: result.musicSuggestion?.trim() || 'upbeat light',
    };
  }

  private fallbackScript(brief: string, sceneCount: number): ReelScript {
    const topic = brief.trim() || 'escena de marca';
    const scenes = Array.from({ length: sceneCount }, (_, i) => ({
      id: String(i + 1),
      visualPrompt: `Vertical 9:16 keyframe for social Reel about: ${topic}. Scene ${i + 1} of ${sceneCount}. No logos or text overlays.`,
      motionPrompt: `Gentle camera motion, cinematic, scene ${i + 1}: ${topic}`,
      subtitle: '',
      durationHintSeconds: 5,
    }));
    return { scenes, musicSuggestion: 'upbeat light corporate' };
  }
}

/** Frases del monólogo para subtítulos (≤8 palabras por línea, máx. 4 líneas). */
export function splitSubtitleLines(text: string): string[] {
  const lines: string[] = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 8) {
      lines.push(words.slice(i, i + 8).join(' '));
    }
  }
  return lines.filter(Boolean).slice(0, 4);
}
