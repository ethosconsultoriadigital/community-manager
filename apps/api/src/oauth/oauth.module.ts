import { Module } from '@nestjs/common';
import { CanvaModule } from '../platforms/canva/canva.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { OauthController } from './oauth.controller';

@Module({
  imports: [PlatformsModule, CanvaModule],
  controllers: [OauthController],
})
export class OauthModule {}
