import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import {
  IMAGE_PROVIDER,
  LIPSYNC_PROVIDER,
  LLM_PROVIDER,
  TTS_PROVIDER,
  VIDEO_PROVIDER,
} from './ai.tokens';
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
import { CompositionService } from './composition/composition.service';
import { ScriptService } from './script/script.service';
import { VideoCompositionService } from './video-composition/video-composition.service';
import { ReelPipelineService } from './reel-pipeline.service';
import { ElevenLabsTtsProvider } from './elevenlabs-tts.provider';
import { MockTtsProvider } from './mocks/mock-tts.provider';
import { HybridTtsProvider } from './hybrid-tts.provider';
import { FalLipSyncProvider } from './fal-lipsync.provider';
import { MockLipSyncProvider } from './mocks/mock-lipsync.provider';
import { HybridLipSyncProvider } from './hybrid-lipsync.provider';
import { AvatarPipelineService } from './avatar-pipeline.service';

@Module({
  imports: [MediaModule],
  providers: [
    ContentGenerationService,
    CompositionService,
    ScriptService,
    VideoCompositionService,
    ReelPipelineService,
    AvatarPipelineService,
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
    MockTtsProvider,
    ElevenLabsTtsProvider,
    HybridTtsProvider,
    { provide: TTS_PROVIDER, useExisting: HybridTtsProvider },
    MockLipSyncProvider,
    FalLipSyncProvider,
    HybridLipSyncProvider,
    { provide: LIPSYNC_PROVIDER, useExisting: HybridLipSyncProvider },
  ],
  exports: [ContentGenerationService, ReferenceMaterialService, LLM_PROVIDER, VIDEO_PROVIDER],
})
export class AiModule {}
