import { Module } from '@nestjs/common';
import { CanvaModule } from '../platforms/canva/canva.module';
import { MetaModule } from '../platforms/meta/meta.module';
import { OauthController } from './oauth.controller';

@Module({
  imports: [MetaModule, CanvaModule],
  controllers: [OauthController],
})
export class OauthModule {}
