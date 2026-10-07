export type SynthesizeSpeechInput = {
  text: string;
  /** Voice ID del proveedor (p. ej. ElevenLabs). */
  voiceId?: string;
  languageCode?: string;
};

export type SynthesizeSpeechResult = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  provider: 'elevenlabs' | 'mock';
  model?: string;
  voiceId?: string;
};

export interface TtsProvider {
  synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult>;
}
