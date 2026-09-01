import type { PlatformVisualPreset } from '../platform-visual-presets';

export type GenerateImageInput = {
  brief: string;
  /** Caption del post: ancla el tema visual al mensaje real. */
  caption?: string;
  hashtags?: string[];
  referenceText?: string;
  platformPresets?: PlatformVisualPreset[];
  imageSize?: '1024x1024' | '1024x1792';
  /** Necesario para guardar la imagen en storage propio (OpenAI real). */
  agencyId?: string;
};

export type GenerateImageResult = {
  url: string;
  width: number;
  height: number;
  /** Modelo usado (p. ej. gpt-image-2, mock-image). */
  model?: string;
  provider?: 'openai' | 'mock';
};

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}
