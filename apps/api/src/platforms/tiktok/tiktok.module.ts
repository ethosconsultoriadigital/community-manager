import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokOAuthStateStore } from './tiktok-oauth-state.store';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';

@Module({
  imports: [AccessModule],
  providers: [
    TikTokApiClient,
    TikTokOAuthStateStore,
    TikTokOAuthService,
    TikTokTokenRefreshService,
  ],
  exports: [
    TikTokApiClient,
    TikTokOAuthService,
    TikTokTokenRefreshService,
  ],
})
export class TikTokModule {}
