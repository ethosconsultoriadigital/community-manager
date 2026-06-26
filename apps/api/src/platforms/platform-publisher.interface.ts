export type PublishPlatform = 'facebook' | 'instagram';

export type VideoFormat = 'feed' | 'reel';

export type PublishTargetInput = {
  platform: PublishPlatform;
  externalAccountId: string;
  accessToken: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  videoFormat?: VideoFormat;
};

export type PublishResult = {
  platformPostId: string;
};

export interface PlatformPublisher {
  publish(input: PublishTargetInput): Promise<PublishResult>;
}
