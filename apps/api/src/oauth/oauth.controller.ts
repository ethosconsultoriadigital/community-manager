import {
  BadRequestException,
  Controller,
  Get,
  Logger,
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
import { ThreadsOAuthService } from '../platforms/threads/threads-oauth.service';
import { XOAuthService } from '../platforms/x/x-oauth.service';
import { XOAuthStateInvalidError } from '../platforms/x/x.types';
import { TikTokOAuthService } from '../platforms/tiktok/tiktok-oauth.service';
import { TikTokOAuthStateInvalidError } from '../platforms/tiktok/tiktok.types';

@Controller('oauth')
export class OauthController {
  private readonly logger = new Logger(OauthController.name);

  constructor(
    private readonly metaOAuth: MetaOAuthService,
    private readonly threadsOAuth: ThreadsOAuthService,
    private readonly xOAuth: XOAuthService,
    private readonly tiktokOAuth: TikTokOAuthService,
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

  @Get('meta/connect-url')
  @UseGuards(JwtAuthGuard)
  async metaConnectUrl(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId es obligatorio');
    }
    const url = await this.metaOAuth.startConnect(user, clientId);
    return { url };
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

  @Get('threads/connect-url')
  @UseGuards(JwtAuthGuard)
  async threadsConnectUrl(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId es obligatorio');
    }
    const url = await this.threadsOAuth.startConnect(user, clientId);
    return { url };
  }

  @Get('threads/callback')
  async callbackThreads(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Parámetros OAuth de Threads incompletos');
    }
    await this.threadsOAuth.handleCallback(code, state);
    return res.redirect(this.threadsOAuth.getSuccessRedirectUrl());
  }

  @Get('threads/status')
  @UseGuards(JwtAuthGuard)
  threadsStatus() {
    return { enabled: this.threadsOAuth.isEnabled() };
  }

  @Get('x/connect-url')
  @UseGuards(JwtAuthGuard)
  async xConnectUrl(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId es obligatorio');
    }
    const url = await this.xOAuth.startConnect(user, clientId);
    return { url };
  }

  @Get('x/callback')
  async callbackX(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Parámetros OAuth de X incompletos');
    }
    try {
      await this.xOAuth.handleCallback(code, state);
      return res.redirect(this.xOAuth.getSuccessRedirectUrl());
    } catch (err) {
      if (err instanceof XOAuthStateInvalidError) {
        return res.redirect(err.redirectUrl);
      }
      throw err;
    }
  }

  @Get('x/status')
  @UseGuards(JwtAuthGuard)
  xStatus() {
    return { enabled: this.xOAuth.isEnabled() };
  }

  @Get('tiktok/connect-url')
  @UseGuards(JwtAuthGuard)
  async tiktokConnectUrl(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId es obligatorio');
    }
    const url = await this.tiktokOAuth.startConnect(user, clientId);
    return { url };
  }

  @Get('tiktok/callback')
  async callbackTikTok(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    if (error || errorDescription) {
      this.logger.warn(
        `TikTok OAuth denegado: error=${error ?? 'n/a'} description=${errorDescription ?? 'n/a'}`,
      );
      return res.redirect(this.tiktokOAuth.getErrorRedirectUrl('tiktok_denied'));
    }
    if (!code || !state) {
      throw new UnauthorizedException('Parámetros OAuth de TikTok incompletos');
    }
    try {
      await this.tiktokOAuth.handleCallback(code, state);
      return res.redirect(this.tiktokOAuth.getSuccessRedirectUrl());
    } catch (err) {
      if (err instanceof TikTokOAuthStateInvalidError) {
        return res.redirect(err.redirectUrl);
      }
      throw err;
    }
  }

  @Get('tiktok/status')
  @UseGuards(JwtAuthGuard)
  tiktokStatus() {
    return { enabled: this.tiktokOAuth.isEnabled() };
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
