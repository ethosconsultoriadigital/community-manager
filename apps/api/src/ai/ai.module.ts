import { Module } from '@nestjs/common';
import { CANVA_PROVIDER, IMAGE_PROVIDER, LLM_PROVIDER } from './ai.tokens';
import { ContentGenerationService } from './content-generation.service';
import {
  MockCanvaProvider,
  MockImageProvider,
  MockLlmProvider,
} from './mocks/mock-providers';

@Module({
  providers: [
    ContentGenerationService,
    { provide: LLM_PROVIDER, useClass: MockLlmProvider },
    { provide: IMAGE_PROVIDER, useClass: MockImageProvider },
    { provide: CANVA_PROVIDER, useClass: MockCanvaProvider },
  ],
  exports: [ContentGenerationService],
})
export class AiModule {}
