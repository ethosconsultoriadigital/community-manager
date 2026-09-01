import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { IMAGE_PROVIDER, LLM_PROVIDER } from './ai.tokens';
import { ContentGenerationService } from './content-generation.service';
import { HybridImageProvider } from './hybrid-image.provider';
import { HybridLlmProvider } from './hybrid-llm.provider';
import { MockImageProvider, MockLlmProvider } from './mocks/mock-providers';
import { OpenAiImageProvider } from './openai-image.provider';
import { OpenAiLlmProvider } from './openai-llm.provider';
import { ReferenceMaterialService } from './reference-material.service';

@Module({
  imports: [MediaModule],
  providers: [
    ContentGenerationService,
    ReferenceMaterialService,
    MockLlmProvider,
    OpenAiLlmProvider,
    HybridLlmProvider,
    { provide: LLM_PROVIDER, useExisting: HybridLlmProvider },
    MockImageProvider,
    OpenAiImageProvider,
    HybridImageProvider,
    { provide: IMAGE_PROVIDER, useExisting: HybridImageProvider },
  ],
  exports: [ContentGenerationService, ReferenceMaterialService, LLM_PROVIDER],
})
export class AiModule {}
