import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateImageInput,
  GenerateImageResult,
  ImageProvider,
} from './interfaces/image-provider.interface';
import { MockImageProvider } from './mocks/mock-providers';
import { OpenAiImageProvider } from './openai-image.provider';

/**
 * Usa OpenAI si hay IMAGE_API_KEY / OPENAI_API_KEY; si no, mock (picsum).
 * Así el flujo local sigue funcionando sin credenciales.
 */
@Injectable()
export class HybridImageProvider implements ImageProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly openAi: OpenAiImageProvider,
    private readonly mock: MockImageProvider,
  ) {}

  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    if (this.hasApiKey()) {
      return this.openAi.generateImage(input);
    }
    const result = await this.mock.generateImage(input);
    return { ...result, model: 'mock-image', provider: 'mock' };
  }

  private hasApiKey(): boolean {
    const key =
      this.config.get<string>('IMAGE_API_KEY')?.trim() ||
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      '';
    return Boolean(key);
  }
}
