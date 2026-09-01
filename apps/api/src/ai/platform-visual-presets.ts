export type VisualPlatform = 'facebook' | 'instagram' | 'tiktok' | string;

export type PlatformVisualPreset = {
  platform: string;
  aspectRatio: string;
  imageSize: '1024x1024' | '1024x1792';
  promptHints: string[];
  publishNotes: string[];
};

const PRESETS: Record<string, Omit<PlatformVisualPreset, 'platform'>> = {
  facebook: {
    aspectRatio: '1:1 or 4:5',
    imageSize: '1024x1024',
    promptHints: [
      'Facebook feed style: clear focal point, readable at small size, friendly brand tone.',
    ],
    publishNotes: ['Feed photo or video; stories optional separately.'],
  },
  instagram: {
    aspectRatio: '1:1 feed',
    imageSize: '1024x1024',
    promptHints: [
      'Instagram feed: polished, vibrant, square composition with safe margins.',
    ],
    publishNotes: ['Feed post; use Reel mode for 9:16 video upload.'],
  },
  instagram_reel: {
    aspectRatio: '9:16',
    imageSize: '1024x1792',
    promptHints: [
      'Vertical 9:16 cover-style image with safe zones top/bottom for UI overlays.',
    ],
    publishNotes: ['Reels: upload video 3–90 s, 9:16; cover image optional.'],
  },
  tiktok: {
    aspectRatio: '9:16',
    imageSize: '1024x1792',
    promptHints: [
      'TikTok vertical style: bold hook, minimal text, thumb-stopping visual.',
    ],
    publishNotes: ['TikTok publish not yet connected; preset for future use.'],
  },
};

export function presetsForPlatforms(
  platforms: string[],
  videoFormat?: 'feed' | 'reel' | null,
): PlatformVisualPreset[] {
  const unique = [...new Set(platforms.map((p) => p.toLowerCase()))];
  const result: PlatformVisualPreset[] = [];

  for (const platform of unique) {
    if (platform === 'instagram' && videoFormat === 'reel') {
      result.push({ platform: 'instagram', ...PRESETS.instagram_reel });
      continue;
    }
    const base = PRESETS[platform] ?? {
      aspectRatio: '1:1',
      imageSize: '1024x1024' as const,
      promptHints: [`${platform} social media visual.`],
      publishNotes: [],
    };
    result.push({ platform, ...base });
  }

  return result;
}

export function imageSizeForPresets(presets: PlatformVisualPreset[]): '1024x1024' | '1024x1792' {
  if (presets.some((p) => p.imageSize === '1024x1792')) {
    return '1024x1792';
  }
  return '1024x1024';
}

export function formatPresetChips(presets: PlatformVisualPreset[]): string[] {
  return presets.flatMap((p) => [
    `${p.platform}: ${p.aspectRatio}`,
    ...p.publishNotes,
  ]);
}
