export type GenerateCopyInput = {
  brief: string;
  platforms: string[];
};

export type GenerateCopyResult = {
  caption: string;
  hashtags: string[];
  byPlatform?: Record<string, { caption: string; hashtags: string[] }>;
  usedMock?: boolean;
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

export type GenerateReelScriptInput = {
  brief: string;
  caption?: string;
  referenceText?: string;
  sceneCount: number;
};

export type ReelScriptScene = {
  id: string;
  visualPrompt: string;
  motionPrompt: string;
  subtitle: string;
  durationHintSeconds: number;
};

export type GenerateReelScriptResult = {
  scenes: ReelScriptScene[];
  musicSuggestion?: string;
  usedMock?: boolean;
};

export type GenerateAvatarScriptInput = {
  brief: string;
  caption?: string;
  referenceText?: string;
  /** Segundos aproximados de habla (15–45). */
  targetSeconds?: number;
};

export type GenerateAvatarScriptResult = {
  /** Texto completo para TTS. */
  spokenText: string;
  /** Frases cortas para subtítulos (ordenadas). */
  subtitleLines: string[];
  musicSuggestion?: string;
  usedMock?: boolean;
};

export interface LlmProvider {
  generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult>;
  generateReportNarrative(
    input: GenerateReportNarrativeInput,
  ): Promise<GenerateReportNarrativeResult>;
  generateReelScript(input: GenerateReelScriptInput): Promise<GenerateReelScriptResult>;
  generateAvatarScript(
    input: GenerateAvatarScriptInput,
  ): Promise<GenerateAvatarScriptResult>;
}
