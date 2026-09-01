export type GenerateCopyInput = {
  brief: string;
  platforms: string[];
};

export type GenerateCopyResult = {
  caption: string;
  hashtags: string[];
  byPlatform?: Record<string, { caption: string; hashtags: string[] }>;
};

export type GenerateReportNarrativeInput = {
  clientName?: string;
  days: number;
  platform?: string;
  summaryJson: string;
};

export type GenerateReportNarrativeResult = {
  executiveSummary: string;
  platformHighlights: string;
  recommendations: string;
};

export interface LlmProvider {
  generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult>;
  generateReportNarrative(
    input: GenerateReportNarrativeInput,
  ): Promise<GenerateReportNarrativeResult>;
}
