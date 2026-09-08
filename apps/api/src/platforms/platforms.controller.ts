import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { getPlatformFeatures } from './platform-features';
import { MetaPlacesService } from './meta/meta-places.service';

@Controller('platforms')
export class PlatformsController {
  constructor(
    private readonly config: ConfigService,
    private readonly places: MetaPlacesService,
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

    try {
      const places = await this.places.searchForClient(
        user.agencyId,
        clientId,
        q.trim(),
      );
      return { places };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : 'Error al buscar ubicaciones';
      throw new BadRequestException(message);
    }
  }
}
