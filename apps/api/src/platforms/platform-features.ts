import type { ConfigService } from '@nestjs/config';
import type { PublishPlatform } from './platform-publisher.interface';

function flagTrue(config: ConfigService, key: string): boolean {
  return (config.get<string>(key) ?? 'false').toLowerCase() === 'true';
}

function hasAll(config: ConfigService, keys: string[]): boolean {
  return keys.every((k) => Boolean(config.get<string>(k)?.trim()));
}

/** Facebook e Instagram siempre activos (núcleo actual). */
export function isMetaPublishEnabled(_config: ConfigService): boolean {
  return true;
}

export function isThreadsPublishEnabled(config: ConfigService): boolean {
  return (
    flagTrue(config, 'THREADS_PUBLISH_ENABLED') &&
    hasAll(config, ['THREADS_APP_ID', 'THREADS_APP_SECRET', 'THREADS_REDIRECT_URI'])
  );
}

export function isXPublishEnabled(config: ConfigService): boolean {
  return (
    flagTrue(config, 'X_PUBLISH_ENABLED') &&
    hasAll(config, ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI'])
  );
}

export function isTikTokPublishEnabled(config: ConfigService): boolean {
  return (
    flagTrue(config, 'TIKTOK_PUBLISH_ENABLED') &&
    hasAll(config, ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'])
  );
}

export function isPlatformPublishEnabled(
  config: ConfigService,
  platform: PublishPlatform | string,
): boolean {
  switch (platform) {
    case 'facebook':
    case 'instagram':
      return isMetaPublishEnabled(config);
    case 'threads':
      return isThreadsPublishEnabled(config);
    case 'x':
      return isXPublishEnabled(config);
    case 'tiktok':
      return isTikTokPublishEnabled(config);
    default:
      return false;
  }
}

export type PlatformFeaturesSnapshot = {
  facebook: boolean;
  instagram: boolean;
  threads: boolean;
  x: boolean;
  tiktok: boolean;
};

export function getPlatformFeatures(config: ConfigService): PlatformFeaturesSnapshot {
  return {
    facebook: true,
    instagram: true,
    threads: isThreadsPublishEnabled(config),
    x: isXPublishEnabled(config),
    tiktok: isTikTokPublishEnabled(config),
  };
}
