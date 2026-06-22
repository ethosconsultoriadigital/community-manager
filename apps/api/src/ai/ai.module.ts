import { Module } from '@nestjs/common';
import { CANVA_PROVIDER, IMAGE_PROVIDER, LLM_PROVIDER } from './ai.tokens';
import { ContentGenerationService } from './content-generation.service';
import { MockImageProvider, MockLlmProvider } from './mocks/mock-providers';
import { CanvaModule } from '../platforms/canva/canva.module';
import { HybridCanvaProvider } from '../platforms/canva/hybrid-canva.provider';

@Module({
  imports: [CanvaModule],
  providers: [
    ContentGenerationService,
    { provide: LLM_PROVIDER, useClass: MockLlmProvider },
    { provide: IMAGE_PROVIDER, useClass: MockImageProvider },
    { provide: CANVA_PROVIDER, useExisting: HybridCanvaProvider },
  ],
  exports: [ContentGenerationService],
})
export class AiModule {}
