export const MINIMAX_TTS_MODEL = 'fal-ai/minimax/speech-02-turbo';
export const KOKORO_TTS_MODEL = 'fal-ai/kokoro/spanish';

export const MINIMAX_DEFAULT_VOICE = 'Spanish_Narrator';
export const KOKORO_VOICES = ['ef_dora', 'em_alex', 'em_santa'] as const;
export const KOKORO_DEFAULT_VOICE = 'ef_dora';

export type FalTtsKind = 'minimax' | 'kokoro';

export function falTtsKind(provider: string | undefined): FalTtsKind | null {
  const mode = provider?.trim().toLowerCase() ?? '';
  if (mode === 'minimax') return 'minimax';
  if (mode === 'kokoro') return 'kokoro';
  return null;
}

export function falTtsModel(kind: FalTtsKind): string {
  return kind === 'minimax' ? MINIMAX_TTS_MODEL : KOKORO_TTS_MODEL;
}

/**
 * Una voz de ElevenLabs guardada en la marca no vale en estos modelos.
 * TTS_VOICE_ID (o una voz ya del catálogo) sí.
 */
export function resolveFalTtsVoice(kind: FalTtsKind, requested?: string): string {
  const voice = requested?.trim() ?? '';
  if (kind === 'kokoro') {
    return (KOKORO_VOICES as readonly string[]).includes(voice) ? voice : KOKORO_DEFAULT_VOICE;
  }
  if (voice.startsWith('Spanish_') || voice === 'Wise_Woman') return voice;
  return MINIMAX_DEFAULT_VOICE;
}

export function buildFalTtsBody(
  kind: FalTtsKind,
  text: string,
  voiceId: string,
): Record<string, unknown> {
  const spoken = text.trim().slice(0, 5000);
  if (kind === 'kokoro') {
    return {
      prompt: spoken,
      voice: voiceId,
      speed: 1,
    };
  }
  return {
    text: spoken,
    voice_setting: { voice_id: voiceId },
    language_boost: 'Spanish',
    output_format: 'url',
  };
}

export function extractFalAudioUrl(result: Record<string, unknown>): string | null {
  const fromAudio = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null;
    const url = (node as { url?: unknown }).url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  };
  const direct = fromAudio(result.audio);
  if (direct) return direct;
  if (typeof result.audio_url === 'string' && result.audio_url.trim()) {
    return result.audio_url.trim();
  }
  const data = result.data;
  if (data && typeof data === 'object') {
    const nested = fromAudio((data as { audio?: unknown }).audio);
    if (nested) return nested;
  }
  return null;
}
