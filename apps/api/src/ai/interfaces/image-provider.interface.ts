export type GenerateImageInput = {
  brief: string;
  /** Caption del post: ancla el tema visual al mensaje real. */
  caption?: string;
  hashtags?: string[];
  /** Necesario para guardar la imagen en storage propio (OpenAI real). */
  agencyId?: string;
};

export type GenerateImageResult = {
  url: string;
  width: number;
  height: number;
  /** Modelo usado (p. ej. dall-e-3, mock-image). */
  model?: string;
  provider?: 'openai' | 'mock';
};

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}
