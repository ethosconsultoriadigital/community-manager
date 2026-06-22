import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MediaModule } from '../../media/media.module';
import { MockCanvaProvider } from '../../ai/mocks/mock-providers';
import { CanvaConnectClient } from './canva-connect.client';
import { CanvaOAuthService } from './canva-oauth.service';
import { CanvaTokenService } from './canva-token.service';
import { HybridCanvaProvider } from './hybrid-canva.provider';
import { RealCanvaProvider } from './real-canva.provider';

@Module({
  imports: [AuthModule, MediaModule],
  providers: [
    CanvaConnectClient,
    CanvaTokenService,
    CanvaOAuthService,
    MockCanvaProvider,
    RealCanvaProvider,
    HybridCanvaProvider,
  ],
  exports: [
    CanvaConnectClient,
    CanvaTokenService,
    CanvaOAuthService,
    HybridCanvaProvider,
    MockCanvaProvider,
    RealCanvaProvider,
  ],
})
export class CanvaModule {}
