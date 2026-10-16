import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiMocksAllowed } from './ai-mocks';
import { ElevenLabsTtsProvider } from './elevenlabs-tts.provider';
import { falTtsKind } from './fal-tts-request';
import { FalTtsProvider } from './fal-tts.provider';
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
    private readonly fal: FalTtsProvider,
    private readonly mock: MockTtsProvider,
  ) {}

  synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    const mode = this.config.get<string>('TTS_PROVIDER')?.trim().toLowerCase() ?? '';
    if (mode && mode !== 'elevenlabs' && !falTtsKind(mode)) {
      throw new BadRequestException(
        `TTS_PROVIDER=${mode} no es válido. Usa elevenlabs (default), minimax o kokoro.`,
      );
    }
    if (falTtsKind(mode)) {
      return this.fal.synthesize(input);
    }
    if (this.config.get<string>('ELEVENLABS_API_KEY')?.trim()) {
      return this.eleven.synthesize(input);
    }
    if (!aiMocksAllowed(this.config)) {
      throw new BadRequestException(
        'Falta ELEVENLABS_API_KEY en el servidor. Sin esa clave no hay voz para el avatar (en producción no se sustituye por un tono de prueba).',
      );
    }
    return this.mock.synthesize(input);
  }
}
