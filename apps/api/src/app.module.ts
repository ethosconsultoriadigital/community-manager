import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AgenciesModule } from './agencies/agencies.module';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule } from './clients/clients.module';
import { DbModule } from './db/db.module';
import { JobsModule } from './jobs/jobs.module';
import { OauthModule } from './oauth/oauth.module';
import { PostsModule } from './posts/posts.module';
import { SocialAccountsModule } from './social-accounts/social-accounts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
    }),
    DbModule,
    AuthModule,
    AgenciesModule,
    ClientsModule,
    OauthModule,
    SocialAccountsModule,
    PostsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
