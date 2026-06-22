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
}

export class MockImageProvider implements ImageProvider {
  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const seed = createHash('sha256').update(input.brief).digest('hex').slice(0, 12);
    return {
      url: `https://picsum.photos/seed/${seed}/1080/1080`,
      width: 1080,
      height: 1080,
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
