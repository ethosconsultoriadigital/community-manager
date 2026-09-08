export type PublishPlatform =
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'x'
  | 'tiktok';

export type VideoFormat = 'feed' | 'reel';

export type PublishTargetInput = {
  platform: PublishPlatform;
  externalAccountId: string;
  accessToken: string;
  message: string;
  agencyId?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoFormat?: VideoFormat;
  alsoPublishAsStory?: boolean;
  /** Facebook Page / Place ID (también location_id en Instagram). */
  placeId?: string;
};

export type PublishResult = {
  platformPostId: string;
  storyPlatformPostId?: string;
  storyStatus?: 'published' | 'failed' | 'skipped';
  storyErrorMessage?: string;
};

export interface PlatformPublisher {
  publish(input: PublishTargetInput): Promise<PublishResult>;
}

/** Redes que publica Meta Graph (Page / IG). */
export const META_PUBLISH_PLATFORMS = ['facebook', 'instagram'] as const;
export type MetaPublishPlatform = (typeof META_PUBLISH_PLATFORMS)[number];

export function isMetaPublishPlatform(platform: string): platform is MetaPublishPlatform {
  return (META_PUBLISH_PLATFORMS as readonly string[]).includes(platform);
}
