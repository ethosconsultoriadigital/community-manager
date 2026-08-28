import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStorageService } from '../media/media-storage.service';
import { buildImagePrompt } from './build-image-prompt';
import type {
  GenerateImageInput,
  GenerateImageResult,
  ImageProvider,
} from './interfaces/image-provider.interface';

type OpenAiImagesResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
};

@Injectable()
export class OpenAiImageProvider implements ImageProvider {
  private readonly logger = new Logger(OpenAiImageProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new BadRequestException(
        'Falta IMAGE_API_KEY (o OPENAI_API_KEY) para generar imágenes con OpenAI',
      );
    }
    if (apiKey.startsWith('sk-ant-')) {
      throw new BadRequestException(
        'IMAGE_API_KEY parece una clave de Anthropic. Para imágenes usa una clave de OpenAI (DALL·E / Images API).',
      );
    }
    if (!input.agencyId) {
      throw new BadRequestException('agencyId es obligatorio para guardar la imagen generada');
    }

    // dall-e-2/3 retirados (mayo 2026). Por defecto gpt-image-2.
    const configured = this.config.get<string>('IMAGE_MODEL')?.trim() || '';
    const model =
      !configured || configured.startsWith('dall-e')
        ? 'gpt-image-2'
        : configured;
    const prompt = buildImagePrompt({
      brief: input.brief,
      caption: input.caption,
      hashtags: input.hashtags,
    });
    if (!input.brief.trim()) {
      throw new BadRequestException('El brief es obligatorio para generar la imagen');
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    });

    const payload = (await response.json()) as OpenAiImagesResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? `OpenAI Images HTTP ${response.status}`;
      this.logger.warn(`OpenAI image generation failed: ${message}`);
      throw new BadRequestException(`No se pudo generar la imagen: ${message}`);
    }

    const item = payload.data?.[0];
    if (!item) {
      throw new BadRequestException('OpenAI no devolvió ninguna imagen');
    }

    const buffer = item.b64_json
      ? Buffer.from(item.b64_json, 'base64')
      : await this.downloadImage(item.url);

    const stored = await this.mediaStorage.save({
      agencyId: input.agencyId,
      buffer,
      extension: 'png',
      contentType: 'image/png',
    });

    return {
      url: stored.storageUrl,
      width: 1024,
      height: 1024,
      model,
      provider: 'openai',
    };
  }

  private resolveApiKey(): string | null {
    const key =
      this.config.get<string>('IMAGE_API_KEY')?.trim() ||
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      '';
    return key || null;
  }

  private async downloadImage(url: string | undefined): Promise<Buffer> {
    if (!url) {
      throw new BadRequestException('OpenAI no devolvió url ni b64_json');
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(
        `No se pudo descargar la imagen de OpenAI (${response.status})`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
