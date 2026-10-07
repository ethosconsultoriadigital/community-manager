/**
 * Catálogo de camas musicales propias (generadas con ffmpeg lavfi).
 * No se usa audio con derechos de terceros.
 */

export type LicensedMusicTrack = {
  id: string;
  title: string;
  /** Palabras que matchean musicSuggestion del guion. */
  moods: string[];
  /** Generador lavfi interno. */
  generator: 'soft-upbeat' | 'calm-pad' | 'bright-pop';
  license: 'original-generated';
};

export const LICENSED_MUSIC_TRACKS: LicensedMusicTrack[] = [
  {
    id: 'upbeat-light',
    title: 'Upbeat Light (original)',
    moods: ['upbeat', 'light', 'corporate', 'acoustic', 'happy', 'energetic'],
    generator: 'soft-upbeat',
    license: 'original-generated',
  },
  {
    id: 'calm-ambient',
    title: 'Calm Ambient (original)',
    moods: ['calm', 'ambient', 'soft', 'chill', 'relax', 'peaceful'],
    generator: 'calm-pad',
    license: 'original-generated',
  },
  {
    id: 'bright-pop',
    title: 'Bright Pop (original)',
    moods: ['pop', 'bright', 'fun', 'playful', 'modern'],
    generator: 'bright-pop',
    license: 'original-generated',
  },
];

export const DEFAULT_MUSIC_TRACK_ID = 'upbeat-light';

export function resolveMusicTrackId(
  suggestion?: string,
  explicitId?: string,
): string {
  if (explicitId?.trim()) {
    const found = LICENSED_MUSIC_TRACKS.find((t) => t.id === explicitId.trim());
    if (found) return found.id;
  }
  const text = (suggestion ?? '').toLowerCase();
  if (text) {
    for (const track of LICENSED_MUSIC_TRACKS) {
      if (track.moods.some((m) => text.includes(m))) return track.id;
    }
  }
  return DEFAULT_MUSIC_TRACK_ID;
}

export function getMusicTrack(id: string): LicensedMusicTrack {
  return (
    LICENSED_MUSIC_TRACKS.find((t) => t.id === id) ??
    LICENSED_MUSIC_TRACKS.find((t) => t.id === DEFAULT_MUSIC_TRACK_ID)!
  );
}

/** Duración objetivo (s) → nº de escenas (~5 s/escena). */
export function sceneCountFromTargetDuration(seconds?: number): number | undefined {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return undefined;
  if (seconds <= 12) return 2;
  if (seconds <= 18) return 3;
  return 4;
}
