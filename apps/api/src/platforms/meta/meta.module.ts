import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MetaGraphClient } from './meta-graph.client';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaPublishService } from './meta-publish.service';
import { MetaTokenRefreshService } from './meta-token-refresh.service';

@Module({
  imports: [AuthModule],
  providers: [
    MetaGraphClient,
    MetaOAuthService,
    MetaTokenRefreshService,
    MetaPublishService,
  ],
  exports: [
    MetaGraphClient,
    MetaOAuthService,
    MetaTokenRefreshService,
    MetaPublishService,
  ],
})
export class MetaModule {}
