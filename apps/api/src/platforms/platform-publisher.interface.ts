export type PublishPlatform = 'facebook' | 'instagram';

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
