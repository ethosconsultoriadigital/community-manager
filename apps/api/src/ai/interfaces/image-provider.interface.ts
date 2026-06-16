export type GenerateImageInput = {
  brief: string;
};

export type GenerateImageResult = {
  url: string;
  width: number;
  height: number;
};

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}
