import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsTtsProvider } from './elevenlabs-tts.provider';
import type {
  SynthesizeSpeechInput,
  SynthesizeSpeechResult,
  TtsProvider,
} from './interfaces/tts-provider.interface';
import { MockTtsProvider } from './mocks/mock-tts.provider';

@Injectable()
export class HybridTtsProvider implements TtsProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly eleven: ElevenLabsTtsProvider,
    private readonly mock: MockTtsProvider,
  ) {}

  synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    if (this.config.get<string>('ELEVENLABS_API_KEY')?.trim()) {
      return this.eleven.synthesize(input);
    }
    return this.mock.synthesize(input);
  }
}
