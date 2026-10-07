import { describe, expect, it } from 'vitest';
import {
  resolveMusicTrackId,
  sceneCountFromTargetDuration,
} from './licensed-music';

describe('licensed-music', () => {
  it('resuelve pista por suggestion de mood', () => {
    expect(resolveMusicTrackId('calm ambient chill')).toBe('calm-ambient');
    expect(resolveMusicTrackId('bright fun pop')).toBe('bright-pop');
    expect(resolveMusicTrackId('algo desconocido')).toBe('upbeat-light');
  });

  it('prioriza musicTrackId explícito', () => {
    expect(resolveMusicTrackId('calm', 'bright-pop')).toBe('bright-pop');
  });

  it('mapea duración objetivo a escenas', () => {
    expect(sceneCountFromTargetDuration(10)).toBe(2);
    expect(sceneCountFromTargetDuration(15)).toBe(3);
    expect(sceneCountFromTargetDuration(20)).toBe(4);
  });
});
