import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SynthesizeSpeechInput,
  SynthesizeSpeechResult,
  TtsProvider,
} from './interfaces/tts-provider.interface';

/** Voz multilíngüe por defecto (ElevenLabs). Sobrescribible con ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

@Injectable()
export class ElevenLabsTtsProvider implements TtsProvider {
  private readonly logger = new Logger(ElevenLabsTtsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY')?.trim();
    if (!apiKey) {
      throw new BadRequestException('Falta ELEVENLABS_API_KEY para TTS');
    }
    const text = input.text?.trim();
    if (!text) {
      throw new BadRequestException('El texto para TTS es obligatorio');
    }

    const voiceId =
      input.voiceId?.trim() ||
      this.config.get<string>('ELEVENLABS_VOICE_ID')?.trim() ||
      DEFAULT_VOICE;
    const model =
      this.config.get<string>('ELEVENLABS_MODEL')?.trim() || 'eleven_multilingual_v2';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.slice(0, 2500),
          model_id: model,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.warn(`ElevenLabs TTS failed: ${response.status} ${errText.slice(0, 200)}`);
      throw new BadRequestException(
        `No se pudo sintetizar la voz (${response.status})`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      contentType: 'audio/mpeg',
      extension: 'mp3',
      provider: 'elevenlabs',
      model,
      voiceId,
    };
  }
}
