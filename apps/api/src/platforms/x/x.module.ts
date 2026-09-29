import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module';
import { XApiClient } from './x-api.client';
import { XOAuthStateStore } from './x-oauth-state.store';
import { XOAuthService } from './x-oauth.service';
import { XPublishService } from './x-publish.service';
import { XTokenRefreshService } from './x-token-refresh.service';

@Module({
  imports: [AccessModule],
  providers: [
    XApiClient,
    XOAuthStateStore,
    XOAuthService,
    XPublishService,
    XTokenRefreshService,
  ],
  exports: [XApiClient, XOAuthService, XPublishService, XTokenRefreshService],
})
export class XModule {}
