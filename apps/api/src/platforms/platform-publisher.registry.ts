import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isMetaPublishPlatform,
  type PlatformPublisher,
  type PublishPlatform,
} from './platform-publisher.interface';
import { isPlatformPublishEnabled } from './platform-features';
import { MetaPublishService } from './meta/meta-publish.service';
import { ThreadsPublishService } from './threads/threads-publish.service';
import { TikTokPublishService } from './tiktok/tiktok-publish.service';
import { XPublishService } from './x/x-publish.service';

/**
 * Despacha publicación por plataforma.
 * Meta (FB/IG) siempre; Threads/X/TikTok solo si el flag y credenciales están activos.
 */
@Injectable()
export class PlatformPublisherRegistry {
  constructor(
    private readonly config: ConfigService,
    private readonly metaPublish: MetaPublishService,
    private readonly threadsPublish: ThreadsPublishService,
    private readonly xPublish: XPublishService,
    private readonly tiktokPublish: TikTokPublishService,
  ) {}

  getPublisher(platform: string): PlatformPublisher {
    if (isMetaPublishPlatform(platform)) {
      return this.metaPublish;
    }

    if (platform === 'threads') {
      if (!isPlatformPublishEnabled(this.config, 'threads')) {
        throw new Error(
          'Publicación en Threads desactivada (THREADS_PUBLISH_ENABLED / credenciales)',
        );
      }
      return this.threadsPublish;
    }

    if (platform === 'x') {
      if (!isPlatformPublishEnabled(this.config, 'x')) {
        throw new Error(
          'Publicación en X desactivada (X_PUBLISH_ENABLED / credenciales)',
        );
      }
      return this.xPublish;
    }

    if (platform === 'tiktok') {
      if (!isPlatformPublishEnabled(this.config, 'tiktok')) {
        throw new Error(
          'Publicación en TikTok desactivada (TIKTOK_PUBLISH_ENABLED / credenciales)',
        );
      }
      return this.tiktokPublish;
    }

    throw new Error(`Plataforma no soportada para publicación: ${platform}`);
  }

  assertPublishable(platform: string): asserts platform is PublishPlatform {
    this.getPublisher(platform);
  }
}
