import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AccessModule } from '../../access/access.module';
import { ThreadsApiClient } from './threads-api.client';
import { ThreadsOAuthService } from './threads-oauth.service';
import { ThreadsPublishService } from './threads-publish.service';
import { ThreadsTokenRefreshService } from './threads-token-refresh.service';

@Module({
  imports: [AuthModule, AccessModule],
  providers: [
    ThreadsApiClient,
    ThreadsOAuthService,
    ThreadsPublishService,
    ThreadsTokenRefreshService,
  ],
  exports: [
    ThreadsApiClient,
    ThreadsOAuthService,
    ThreadsPublishService,
    ThreadsTokenRefreshService,
  ],
})
export class ThreadsModule {}
