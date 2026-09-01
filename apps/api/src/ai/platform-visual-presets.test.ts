import { describe, expect, it } from 'vitest';
import { imageSizeForPresets, presetsForPlatforms } from './platform-visual-presets';

describe('platform-visual-presets', () => {
  it('usa 9:16 para instagram reel', () => {
    const presets = presetsForPlatforms(['instagram'], 'reel');
    expect(presets[0]?.imageSize).toBe('1024x1792');
  });

  it('usa cuadrado para facebook e instagram feed', () => {
    const presets = presetsForPlatforms(['facebook', 'instagram']);
    expect(imageSizeForPresets(presets)).toBe('1024x1024');
  });

  it('incluye preset tiktok vertical', () => {
    const presets = presetsForPlatforms(['tiktok']);
    expect(presets[0]?.aspectRatio).toBe('9:16');
  });
});
