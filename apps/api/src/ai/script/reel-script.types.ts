export type {
  GenerateReelScriptInput,
  GenerateReelScriptResult,
  ReelScriptScene as ReelScene,
} from '../interfaces/llm-provider.interface';

import type { GenerateReelScriptResult } from '../interfaces/llm-provider.interface';

export type ReelScript = Pick<GenerateReelScriptResult, 'scenes' | 'musicSuggestion'>;
