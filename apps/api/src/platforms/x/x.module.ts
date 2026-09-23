import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AccessModule } from '../../access/access.module';
import { XApiClient } from './x-api.client';
import { XOAuthService } from './x-oauth.service';
import { XPublishService } from './x-publish.service';
import { XTokenRefreshService } from './x-token-refresh.service';

@Module({
  imports: [AuthModule, AccessModule],
  providers: [XApiClient, XOAuthService, XPublishService, XTokenRefreshService],
  exports: [XApiClient, XOAuthService, XPublishService, XTokenRefreshService],
})
export class XModule {}
