import {
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MetaOAuthService } from '../platforms/meta/meta-oauth.service';

@Controller('oauth/meta')
export class OauthController {
  constructor(private readonly metaOAuth: MetaOAuthService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
    @Res() res: Response,
  ) {
    if (!clientId) {
      throw new UnauthorizedException('clientId es obligatorio');
    }
    const url = await this.metaOAuth.startConnect(user, clientId);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Parámetros OAuth incompletos');
    }
    await this.metaOAuth.handleCallback(code, state);
    return res.redirect(this.metaOAuth.getSuccessRedirectUrl());
  }
}
