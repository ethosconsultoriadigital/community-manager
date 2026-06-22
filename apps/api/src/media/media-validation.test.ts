import { describe, expect, it } from 'vitest';
import { MediaValidationError, validateUploadFile } from './media-validation';

describe('validateUploadFile', () => {
  it('acepta JPEG dentro del límite', () => {
    const result = validateUploadFile({
      mime: 'image/jpeg',
      size: 1024,
      originalName: 'foto.jpg',
    });
    expect(result.mediaType).toBe('image');
    expect(result.extension).toBe('jpg');
  });

  it('acepta MP4 dentro del límite', () => {
    const result = validateUploadFile({
      mime: 'video/mp4',
      size: 5 * 1024 * 1024,
      originalName: 'clip.mp4',
    });
    expect(result.mediaType).toBe('video');
    expect(result.extension).toBe('mp4');
  });

  it('rechaza MIME no permitido', () => {
    expect(() =>
      validateUploadFile({ mime: 'application/pdf', size: 100 }),
    ).toThrow(MediaValidationError);
  });

  it('rechaza imagen demasiado grande', () => {
    expect(() =>
      validateUploadFile({ mime: 'image/png', size: 11 * 1024 * 1024 }),
    ).toThrow(/límite/);
  });
});
