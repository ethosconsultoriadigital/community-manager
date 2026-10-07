import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateCopyInput,
  GenerateCopyResult,
  GenerateAvatarScriptInput,
  GenerateAvatarScriptResult,
  GenerateReelScriptInput,
  GenerateReelScriptResult,
  GenerateReportNarrativeInput,
  GenerateReportNarrativeResult,
  LlmProvider,
} from './interfaces/llm-provider.interface';
import { MockLlmProvider } from './mocks/mock-providers';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Injectable()
export class HybridLlmProvider implements LlmProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly openAi: OpenAiLlmProvider,
    private readonly mock: MockLlmProvider,
  ) {}

  async generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult> {
    if (this.hasApiKey()) {
      const result = await this.openAi.generateCopy(input);
      return { ...result, usedMock: false };
    }
    const result = await this.mock.generateCopy(input);
    return { ...result, usedMock: true };
  }

  generateReportNarrative(
    input: GenerateReportNarrativeInput,
  ): Promise<GenerateReportNarrativeResult> {
    if (this.hasApiKey()) return this.openAi.generateReportNarrative(input);
    return this.mock.generateReportNarrative(input);
  }

  async generateReelScript(
    input: GenerateReelScriptInput,
  ): Promise<GenerateReelScriptResult> {
    if (this.hasApiKey()) {
      const result = await this.openAi.generateReelScript(input);
      return { ...result, usedMock: false };
    }
    const result = await this.mock.generateReelScript(input);
    return { ...result, usedMock: true };
  }

  async generateAvatarScript(
    input: GenerateAvatarScriptInput,
  ): Promise<GenerateAvatarScriptResult> {
    if (this.hasApiKey()) {
      const result = await this.openAi.generateAvatarScript(input);
      return { ...result, usedMock: false };
    }
    const result = await this.mock.generateAvatarScript(input);
    return { ...result, usedMock: true };
  }

  private hasApiKey(): boolean {
    const key =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      this.config.get<string>('IMAGE_API_KEY')?.trim() ||
      '';
    return Boolean(key) && !key.startsWith('sk-ant-');
  }
}
