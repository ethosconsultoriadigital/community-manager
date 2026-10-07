import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  SynthesizeSpeechInput,
  SynthesizeSpeechResult,
  TtsProvider,
} from '../interfaces/tts-provider.interface';

/**
 * TTS mock: genera un tono corto con ffmpeg (sin ElevenLabs).
 * La duración aproxima la longitud del texto.
 */
@Injectable()
export class MockTtsProvider implements TtsProvider {
  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    const words = input.text.trim().split(/\s+/).filter(Boolean).length;
    const duration = Math.min(20, Math.max(2, Math.round(words * 0.35)));
    const ffmpeg = await resolveFfmpeg();
    if (!ffmpeg) {
      // WAV mínimo silencioso ~1s
      return {
        buffer: silentWav(1),
        contentType: 'audio/wav',
        extension: 'wav',
        provider: 'mock',
        model: 'mock-tts',
        voiceId: input.voiceId ?? 'mock',
      };
    }

    const dir = await mkdtemp(join(tmpdir(), 'cm-tts-mock-'));
    const out = join(dir, 'speech.mp3');
    try {
      await run(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=180:duration=${duration}`,
        '-af',
        'volume=0.2',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '6',
        out,
      ]);
      const buffer = await readFile(out);
      return {
        buffer,
        contentType: 'audio/mpeg',
        extension: 'mp3',
        provider: 'mock',
        model: 'mock-tts',
        voiceId: input.voiceId ?? 'mock',
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function resolveFfmpeg(): Promise<string | null> {
  try {
    const mod = await import('ffmpeg-static');
    const path = (mod as { default?: string | null }).default;
    return typeof path === 'string' && path ? path : null;
  } catch {
    return null;
  }
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)),
    );
  });
}

function silentWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
