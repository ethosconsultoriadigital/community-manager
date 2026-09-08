import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { decryptToken } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { getPlatformFeatures } from './platform-features';
import { MetaGraphClient } from './meta/meta-graph.client';

@Controller('platforms')
export class PlatformsController {
  constructor(
    private readonly config: ConfigService,
    private readonly meta: MetaGraphClient,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly clientAccess: ClientAccessService,
  ) {}

  /** Qué redes están habilitadas para conectar/publicar en este entorno. */
  @Get('features')
  features() {
    return getPlatformFeatures(this.config);
  }

  /** Busca lugares de Meta para etiquetar en Facebook / Instagram. */
  @Get('meta/places')
  @UseGuards(JwtAuthGuard)
  async searchPlaces(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId es obligatorio');
    if (!q?.trim()) return { places: [] };

    await this.clientAccess.assertClientAccess(user, clientId);

    const accounts = await this.socialAccounts.findByAgency(user.agencyId, clientId);
    const fb = accounts.find((a) => a.platform === 'facebook' && a.is_active);
    if (!fb) {
      throw new BadRequestException(
        'Conecta una cuenta Facebook activa del cliente para buscar ubicaciones',
      );
    }

    const withToken = await this.socialAccounts.findByIdWithToken(user.agencyId, fb.id);
    if (!withToken?.access_token_enc) {
      throw new BadRequestException('No hay token de Facebook disponible');
    }

    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('TOKEN_ENCRYPTION_KEY no está definida');
    const accessToken = decryptToken(withToken.access_token_enc, key);
    const places = await this.meta.searchPlaces(accessToken, q.trim());
    return { places };
  }
}
