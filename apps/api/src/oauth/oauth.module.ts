import { Module } from '@nestjs/common';
import { MetaModule } from '../platforms/meta/meta.module';
import { OauthController } from './oauth.controller';

@Module({
  imports: [MetaModule],
  controllers: [OauthController],
})
export class OauthModule {}
