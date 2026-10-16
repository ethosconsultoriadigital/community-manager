import { describe, expect, it } from 'vitest';
import {
  KOKORO_TTS_MODEL,
  MINIMAX_TTS_MODEL,
  buildFalTtsBody,
  extractFalAudioUrl,
  falTtsModel,
  resolveFalTtsVoice,
} from './fal-tts-request';

describe('fal TTS opt-in', () => {
  it('minimax habla español y pide URL, no hex', () => {
    expect(falTtsModel('minimax')).toBe(MINIMAX_TTS_MODEL);
    expect(buildFalTtsBody('minimax', 'Hola comunidad', 'Spanish_ConfidentWoman')).toEqual({
      text: 'Hola comunidad',
      voice_setting: { voice_id: 'Spanish_ConfidentWoman' },
      language_boost: 'Spanish',
      output_format: 'url',
    });
  });

  it('ignora un voice id de ElevenLabs y usa la voz española por defecto', () => {
    expect(resolveFalTtsVoice('minimax', 'JBFqnCBsd6RMkjVDRZzb')).toBe('Spanish_Narrator');
    expect(resolveFalTtsVoice('kokoro', 'JBFqnCBsd6RMkjVDRZzb')).toBe('ef_dora');
    expect(resolveFalTtsVoice('kokoro', 'em_alex')).toBe('em_alex');
  });

  it('kokoro manda prompt y voice, no el cuerpo de minimax', () => {
    expect(falTtsModel('kokoro')).toBe(KOKORO_TTS_MODEL);
    expect(buildFalTtsBody('kokoro', 'Buenos días', 'ef_dora')).toEqual({
      prompt: 'Buenos días',
      voice: 'ef_dora',
      speed: 1,
    });
  });

  it('lee audio.url', () => {
    expect(extractFalAudioUrl({ audio: { url: 'https://cdn/a.mp3' } })).toBe(
      'https://cdn/a.mp3',
    );
  });
});
