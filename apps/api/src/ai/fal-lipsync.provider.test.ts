import { describe, expect, it } from 'vitest';
import { buildLipSyncBody } from './fal-lipsync.provider';
import { formatFalError } from './fal-queue';

describe('buildLipSyncBody', () => {
  it('usa campos de SadTalker', () => {
    expect(buildLipSyncBody('fal-ai/sadtalker', 'https://img', 'https://aud')).toEqual({
      source_image_url: 'https://img',
      driven_audio_url: 'https://aud',
      preprocess: 'crop',
      face_model_resolution: '256',
    });
  });

  it('usa image_url/audio_url para live-avatar', () => {
    expect(buildLipSyncBody('fal-ai/live-avatar', 'https://img', 'https://aud')).toEqual({
      image_url: 'https://img',
      audio_url: 'https://aud',
    });
  });
});

describe('formatFalError', () => {
  it('serializa detail objeto/array sin [object Object]', () => {
    expect(formatFalError([{ msg: 'field required' }])).toContain('field required');
    expect(formatFalError({ message: 'invalid input' })).toBe('invalid input');
    expect(formatFalError({ foo: 1 })).toContain('foo');
  });
});
