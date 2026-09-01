import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateCopyInput,
  GenerateCopyResult,
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
