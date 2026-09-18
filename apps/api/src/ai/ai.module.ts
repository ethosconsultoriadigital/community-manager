import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { IMAGE_PROVIDER, LLM_PROVIDER, VIDEO_PROVIDER } from './ai.tokens';
import { ContentGenerationService } from './content-generation.service';
import { FalVideoProvider } from './fal-video.provider';
import { HybridImageProvider } from './hybrid-image.provider';
import { HybridLlmProvider } from './hybrid-llm.provider';
import { HybridVideoProvider } from './hybrid-video.provider';
import { MockImageProvider, MockLlmProvider } from './mocks/mock-providers';
import { MockVideoProvider } from './mocks/mock-video.provider';
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
    MockVideoProvider,
    FalVideoProvider,
    HybridVideoProvider,
    { provide: VIDEO_PROVIDER, useExisting: HybridVideoProvider },
  ],
  exports: [ContentGenerationService, ReferenceMaterialService, LLM_PROVIDER, VIDEO_PROVIDER],
})
export class AiModule {}
