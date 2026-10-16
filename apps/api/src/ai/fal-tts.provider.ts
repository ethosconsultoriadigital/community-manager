import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadUrlToFile } from './download-to-file';
import { runFalQueueJob } from './fal-queue';
import {
  buildFalTtsBody,
  extractFalAudioUrl,
  falTtsKind,
  falTtsModel,
  resolveFalTtsVoice,
  type FalTtsKind,
} from './fal-tts-request';
import type {
  SynthesizeSpeechInput,
  SynthesizeSpeechResult,
  TtsProvider,
} from './interfaces/tts-provider.interface';

/**
 * Voces opt-in en fal (TTS_PROVIDER=minimax|kokoro). ElevenLabs sigue siendo el default.
 */
@Injectable()
export class FalTtsProvider implements TtsProvider {
  private readonly logger = new Logger(FalTtsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    const kind = falTtsKind(this.config.get<string>('TTS_PROVIDER'));
    if (!kind) {
      throw new BadRequestException(
        'TTS_PROVIDER debe ser minimax o kokoro para usar la voz de fal.',
      );
    }
    const apiKey = this.config.get<string>('FAL_KEY')?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        `Falta FAL_KEY para la voz (TTS_PROVIDER=${kind}).`,
      );
    }
    const text = input.text?.trim();
    if (!text) {
      throw new BadRequestException('El texto para TTS es obligatorio');
    }

    const requested =
      this.config.get<string>('TTS_VOICE_ID')?.trim() || input.voiceId?.trim();
    const voiceId = resolveFalTtsVoice(kind, requested);
    const model = falTtsModel(kind);
    const result = await runFalQueueJob({
      apiKey,
      model,
      body: buildFalTtsBody(kind, text, voiceId),
      logger: this.logger,
      failLabel: 'voz',
    });
    const audioUrl = extractFalAudioUrl(result);
    if (!audioUrl) {
      throw new BadRequestException('fal no devolvió URL de audio');
    }

    const file = audioFile(kind);
    const workDir = await mkdtemp(join(tmpdir(), 'cm-fal-tts-'));
    try {
      const localPath = join(workDir, `speech.${file.extension}`);
      await downloadUrlToFile(audioUrl, localPath);
      const buffer = await readFile(localPath);
      return {
        buffer,
        contentType: file.contentType,
        extension: file.extension,
        provider: 'fal',
        model,
        voiceId,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function audioFile(kind: FalTtsKind): { extension: string; contentType: string } {
  if (kind === 'kokoro') return { extension: 'wav', contentType: 'audio/wav' };
  return { extension: 'mp3', contentType: 'audio/mpeg' };
}
