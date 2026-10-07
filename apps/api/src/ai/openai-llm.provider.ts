import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateCopyInput,
  GenerateCopyResult,
  GenerateAvatarScriptInput,
  GenerateAvatarScriptResult,
  GenerateReelScriptInput,
  GenerateReelScriptResult,
  GenerateReportNarrativeInput,
  GenerateReportNarrativeResult,
  LlmProvider,
} from './interfaces/llm-provider.interface';

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(private readonly config: ConfigService) {}

  async generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult> {
    const prompt = [
      'Genera caption y hashtags para redes sociales.',
      `Brief: ${input.brief}`,
      `Plataformas: ${input.platforms.join(', ')}`,
      'Responde en JSON: {"caption":"...","hashtags":["#a"],"byPlatform":{"facebook":{"caption":"...","hashtags":[]}}}',
    ].join('\n');

    const raw = await this.chat(prompt, 'gpt-4o-mini');
    try {
      const parsed = JSON.parse(raw) as GenerateCopyResult;
      return {
        caption: parsed.caption ?? input.brief,
        hashtags: parsed.hashtags ?? [],
        byPlatform: parsed.byPlatform,
      };
    } catch {
      return { caption: raw.slice(0, 500), hashtags: [] };
    }
  }

  async generateReelScript(
    input: GenerateReelScriptInput,
  ): Promise<GenerateReelScriptResult> {
    const n = Math.min(4, Math.max(2, Math.round(input.sceneCount) || 2));
    const prompt = [
      'Eres guionista de Reels verticales 9:16 para redes sociales.',
      `Tema / brief: ${input.brief}`,
      input.caption ? `Caption del post: ${input.caption}` : '',
      input.referenceText
        ? `Material de referencia (resumir en escenas, NO inventar logos): ${input.referenceText.slice(0, 2000)}`
        : '',
      `Genera exactamente ${n} escenas cortas (~5s cada una).`,
      'Cada escena necesita: visualPrompt (keyframe fotográfico sin texto ni logos), motionPrompt (movimiento de cámara/sujeto para image-to-video), subtitle (frase corta opcional), durationHintSeconds (4-8).',
      'Responde JSON estricto:',
      '{"scenes":[{"id":"1","visualPrompt":"...","motionPrompt":"...","subtitle":"...","durationHintSeconds":5}],"musicSuggestion":"estilo musical breve"}',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.chat(prompt, 'gpt-4o-mini');
    try {
      const parsed = JSON.parse(raw) as GenerateReelScriptResult;
      return {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        musicSuggestion: parsed.musicSuggestion,
      };
    } catch {
      this.logger.warn('generateReelScript: JSON inválido, escenas vacías');
      return { scenes: [] };
    }
  }

  async generateAvatarScript(
    input: GenerateAvatarScriptInput,
  ): Promise<GenerateAvatarScriptResult> {
    const seconds = Math.min(45, Math.max(12, Math.round(input.targetSeconds ?? 20)));
    const prompt = [
      'Eres guionista de un personaje estilizado (robot/mascota) que habla a cámara en un Reel vertical.',
      'NO es un presentador humano realista. Tono cercano, claro, en español.',
      `Tema / brief: ${input.brief}`,
      input.caption ? `Caption del post: ${input.caption}` : '',
      input.referenceText
        ? `Material de referencia (resumir, no citar logos): ${input.referenceText.slice(0, 1500)}`
        : '',
      `El monólogo debe durar ~${seconds} segundos al hablar (~2.5 palabras/segundo).`,
      'Responde JSON estricto:',
      '{"spokenText":"monólogo completo para TTS","subtitleLines":["frase1","frase2"],"musicSuggestion":"estilo breve"}',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.chat(prompt, 'gpt-4o-mini');
    try {
      const parsed = JSON.parse(raw) as GenerateAvatarScriptResult;
      return {
        spokenText: (parsed.spokenText ?? '').trim(),
        subtitleLines: Array.isArray(parsed.subtitleLines)
          ? parsed.subtitleLines.map((s) => String(s).trim()).filter(Boolean)
          : [],
        musicSuggestion: parsed.musicSuggestion,
      };
    } catch {
      this.logger.warn('generateAvatarScript: JSON inválido');
      return { spokenText: '', subtitleLines: [] };
    }
  }

  async generateReportNarrative(
    input: GenerateReportNarrativeInput,
  ): Promise<GenerateReportNarrativeResult> {
    const prompt = [
      'Eres analista de social media. Genera un informe profesional en español basado SOLO en los datos JSON.',
      `Cliente: ${input.clientName ?? 'Agencia'}`,
      `Periodo: últimos ${input.days} días`,
      input.platform ? `Red filtrada: ${input.platform}` : 'Todas las redes con métricas',
      'Datos:',
      input.summaryJson,
      'Responde en JSON estricto:',
      '{"executiveSummary":"2-3 párrafos","platformHighlights":"bullets por red","recommendations":"3-5 acciones concretas"}',
    ].join('\n');

    const raw = await this.chat(prompt, 'gpt-4o-mini');
    try {
      const parsed = JSON.parse(raw) as GenerateReportNarrativeResult;
      return {
        executiveSummary: parsed.executiveSummary ?? raw,
        platformHighlights: parsed.platformHighlights ?? '',
        recommendations: parsed.recommendations ?? '',
      };
    } catch {
      return {
        executiveSummary: raw.slice(0, 1500),
        platformHighlights: '',
        recommendations: '',
      };
    }
  }

  private async chat(prompt: string, model: string): Promise<string> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error('Falta OPENAI_API_KEY para generar texto con OpenAI');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    const body = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      const msg = body.error?.message ?? response.statusText;
      this.logger.warn(`OpenAI chat error: ${msg}`);
      throw new Error(msg);
    }

    return body.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private resolveApiKey(): string {
    return (
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      this.config.get<string>('IMAGE_API_KEY')?.trim() ||
      ''
    );
  }
}
