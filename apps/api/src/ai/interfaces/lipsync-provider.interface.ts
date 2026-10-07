export type LipSyncInput = {
  /** URL pública de la imagen del personaje. */
  characterImageUrl: string;
  /** URL pública del audio (TTS). */
  audioUrl: string;
  agencyId: string;
};

export type LipSyncResult = {
  url: string;
  width: number;
  height: number;
  provider: 'fal' | 'mock';
  model?: string;
};

export interface LipSyncProvider {
  animate(input: LipSyncInput): Promise<LipSyncResult>;
}
