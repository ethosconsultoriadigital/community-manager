export type GenerateVideoInput = {
  /** Descripción visual / movimiento del Reel. */
  prompt: string;
  /** Caption del post: ancla el tema. */
  caption?: string;
  hashtags?: string[];
  referenceText?: string;
  /** URL pública de imagen de referencia (image-to-video). */
  referenceImageUrl?: string;
  /** Necesario para guardar el MP4 en storage propio. */
  agencyId: string;
};

export type GenerateVideoResult = {
  url: string;
  width: number;
  height: number;
  durationSeconds?: number;
  model?: string;
  provider?: 'fal' | 'mock';
};

export interface VideoProvider {
  generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult>;
}
