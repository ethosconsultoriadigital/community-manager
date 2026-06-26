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
import { CanvaEditorService } from '../platforms/canva/canva-editor.service';
import { CanvaOAuthService } from '../platforms/canva/canva-oauth.service';
import { MetaOAuthService } from '../platforms/meta/meta-oauth.service';

@Controller('oauth')
export class OauthController {
  constructor(
    private readonly metaOAuth: MetaOAuthService,
    private readonly canvaOAuth: CanvaOAuthService,
    private readonly canvaEditor: CanvaEditorService,
  ) {}

  @Get('meta/connect')
  @UseGuards(JwtAuthGuard)
  async connectMeta(
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

  @Get('meta/callback')
  async callbackMeta(
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

  @Get('canva/connect-url')
  @UseGuards(JwtAuthGuard)
  async canvaConnectUrl(@CurrentUser() user: AuthUser) {
    const url = await this.canvaOAuth.startConnect(user);
    return { url };
  }

  @Get('canva/callback')
  async callbackCanva(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Parámetros OAuth de Canva incompletos');
    }
    await this.canvaOAuth.handleCallback(code, state);
    return res.redirect(this.canvaOAuth.getSuccessRedirectUrl());
  }

  @Get('canva/status')
  @UseGuards(JwtAuthGuard)
  async canvaStatus(@CurrentUser() user: AuthUser) {
    return this.canvaOAuth.getStatus(user.agencyId);
  }

  @Get('canva/return')
  async canvaReturn(
    @Query('correlation_jwt') correlationJwt: string,
    @Res() res: Response,
  ) {
    if (!correlationJwt) {
      return res.redirect(
        this.canvaEditor.getFrontendErrorUrl('correlation_jwt es obligatorio'),
      );
    }
    try {
      const result = await this.canvaEditor.handleReturn(correlationJwt);
      return res.redirect(this.canvaEditor.getFrontendReturnUrl(result.postId));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo procesar el retorno de Canva';
      return res.redirect(this.canvaEditor.getFrontendErrorUrl(message));
    }
  }
}
