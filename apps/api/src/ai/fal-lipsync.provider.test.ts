import { describe, expect, it } from 'vitest';
import {
  buildLipSyncBody,
  isFaceDetectionError,
  mapLipSyncError,
} from './fal-lipsync.provider';
import { formatFalError } from './fal-queue';
import { BadRequestException } from '@nestjs/common';

describe('buildLipSyncBody', () => {
  it('usa campos de SadTalker (preprocess full para cartoon)', () => {
    expect(buildLipSyncBody('fal-ai/sadtalker', 'https://img', 'https://aud')).toEqual({
      source_image_url: 'https://img',
      driven_audio_url: 'https://aud',
      preprocess: 'full',
      face_model_resolution: '256',
      still: true,
    });
  });

  it('usa image_url/audio_url para sync-lipsync (ilustraciones)', () => {
    expect(
      buildLipSyncBody(
        'fal-ai/sync-lipsync/v3/image-to-video',
        'https://img',
        'https://aud',
      ),
    ).toEqual({
      image_url: 'https://img',
      audio_url: 'https://aud',
    });
  });

  it('usa image_url/audio_url para live-avatar', () => {
    expect(buildLipSyncBody('fal-ai/live-avatar', 'https://img', 'https://aud')).toEqual({
      image_url: 'https://img',
      audio_url: 'https://aud',
    });
  });
});

describe('face detection errors', () => {
  it('detecta mensaje de fal', () => {
    expect(
      isFaceDetectionError(
        new Error('No face detected in the image/video. Please ensure the image/video contains a clearly visible face.'),
      ),
    ).toBe(true);
  });

  it('mapea a mensaje en español usable', () => {
    const mapped = mapLipSyncError(new Error('No face detected in the image/video'));
    expect(mapped).toBeInstanceOf(BadRequestException);
    const body = (mapped as BadRequestException).getResponse();
    const text =
      typeof body === 'string'
        ? body
        : String((body as { message?: string }).message ?? '');
    expect(text).toMatch(/cara usable/i);
  });
});

describe('formatFalError', () => {
  it('serializa detail objeto/array sin [object Object]', () => {
    expect(formatFalError([{ msg: 'field required' }])).toContain('field required');
    expect(formatFalError({ message: 'invalid input' })).toBe('invalid input');
    expect(formatFalError({ foo: 1 })).toContain('foo');
  });
});
