import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MediaModule } from '../../media/media.module';
import { MetaGraphClient } from './meta-graph.client';
import { MetaMetricsService } from './meta-metrics.service';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaPublishService } from './meta-publish.service';
import { MetaTokenRefreshService } from './meta-token-refresh.service';
import { StoryMediaComposerService } from './story-media-composer.service';

@Module({
  imports: [AuthModule, MediaModule],
  providers: [
    MetaGraphClient,
    MetaOAuthService,
    MetaTokenRefreshService,
    MetaPublishService,
    MetaMetricsService,
    StoryMediaComposerService,
  ],
  exports: [
    MetaGraphClient,
    MetaOAuthService,
    MetaTokenRefreshService,
    MetaPublishService,
    MetaMetricsService,
  ],
})
export class MetaModule {}
