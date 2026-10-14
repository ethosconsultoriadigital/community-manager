import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module';
import { MediaModule } from '../../media/media.module';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokOAuthStateStore } from './tiktok-oauth-state.store';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokPublishService } from './tiktok-publish.service';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';

@Module({
  imports: [AccessModule, MediaModule],
  providers: [
    TikTokApiClient,
    TikTokOAuthStateStore,
    TikTokOAuthService,
    TikTokPublishService,
    TikTokTokenRefreshService,
  ],
  exports: [
    TikTokApiClient,
    TikTokOAuthService,
    TikTokPublishService,
    TikTokTokenRefreshService,
  ],
})
export class TikTokModule {}
