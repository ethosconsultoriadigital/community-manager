import { createHash } from 'node:crypto';
import type {
  CanvaProvider,
  ComposeFlyerInput,
  ComposeFlyerResult,
} from '../interfaces/canva-provider.interface';
import type {
  GenerateImageInput,
  GenerateImageResult,
  ImageProvider,
} from '../interfaces/image-provider.interface';
import type {
  GenerateCopyInput,
  GenerateCopyResult,
  GenerateReportNarrativeInput,
  GenerateReportNarrativeResult,
  LlmProvider,
} from '../interfaces/llm-provider.interface';

export class MockLlmProvider implements LlmProvider {
  async generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult> {
    const hashtags = ['#mock', '#communitymanager', '#contenido'];
    const caption = `[Mock LLM] ${input.brief.trim()}`;

    const byPlatform: GenerateCopyResult['byPlatform'] = {};
    for (const platform of input.platforms) {
      byPlatform[platform] = {
        caption: `${caption} (${platform})`,
        hashtags,
      };
    }

    return { caption, hashtags, byPlatform };
  }

  async generateReportNarrative(
    input: GenerateReportNarrativeInput,
  ): Promise<GenerateReportNarrativeResult> {
    const label = input.clientName ?? 'el cliente';
    return {
      executiveSummary: `[Mock] Resumen de ${input.days} días para ${label}. Datos agregados de publicaciones con métricas Meta.`,
      platformHighlights:
        '[Mock] Facebook e Instagram muestran engagement concentrado en los top posts del periodo.',
      recommendations:
        '[Mock] Mantener frecuencia de publicación, replicar formatos con mayor engagement y revisar horarios de publicación.',
    };
  }
}

export class MockImageProvider implements ImageProvider {
  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const seed = createHash('sha256').update(input.brief).digest('hex').slice(0, 12);
    const size = input.imageSize ?? '1024x1024';
    const [w, h] = size.split('x').map(Number);
    const width = Number.isFinite(w) ? w : 1080;
    const height = Number.isFinite(h) ? h : 1080;
    return {
      url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      width,
      height,
      model: 'mock-image',
      provider: 'mock',
    };
  }
}

export class MockCanvaProvider implements CanvaProvider {
  async composeFlyer(input: ComposeFlyerInput): Promise<ComposeFlyerResult> {
    const seed = createHash('sha256')
      .update(`${input.brief}:${input.imageUrl}`)
      .digest('hex')
      .slice(0, 12);

    return {
      url: `https://mock-canva.local/export/${seed}.png`,
      templateId: 'mock-brand-template',
      provider: 'mock',
    };
  }
}
