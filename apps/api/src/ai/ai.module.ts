import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { IMAGE_PROVIDER, LLM_PROVIDER } from './ai.tokens';
import { ContentGenerationService } from './content-generation.service';
import { HybridImageProvider } from './hybrid-image.provider';
import { MockImageProvider, MockLlmProvider } from './mocks/mock-providers';
import { OpenAiImageProvider } from './openai-image.provider';

@Module({
  imports: [MediaModule],
  providers: [
    ContentGenerationService,
    { provide: LLM_PROVIDER, useClass: MockLlmProvider },
    MockImageProvider,
    OpenAiImageProvider,
    HybridImageProvider,
    { provide: IMAGE_PROVIDER, useExisting: HybridImageProvider },
  ],
  exports: [ContentGenerationService],
})
export class AiModule {}
