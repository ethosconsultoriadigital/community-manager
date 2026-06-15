import { Module } from '@nestjs/common';
import { SocialAccountsController } from './social-accounts.controller';

@Module({
  controllers: [SocialAccountsController],
})
export class SocialAccountsModule {}
