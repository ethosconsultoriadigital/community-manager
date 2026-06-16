export type GenerateCopyInput = {
  brief: string;
  platforms: string[];
};

export type GenerateCopyResult = {
  caption: string;
  hashtags: string[];
  byPlatform?: Record<string, { caption: string; hashtags: string[] }>;
};

export interface LlmProvider {
  generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult>;
}
