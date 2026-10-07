import {
  Body,
  Controller,
  Delete,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ClientsRepository, UserClientAssignmentsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MediaStorageService } from '../media/media-storage.service';
import {
  DEFAULT_LAYOUT_KEY,
  DEFAULT_POST_FEED_LAYOUT,
  parseClientBrand,
} from '../ai/composition/brand-layout';

class CreateClientDto {
  name!: string;
  brand?: Record<string, unknown>;
  is_active?: boolean;
}

class UpdateClientDto {
  name?: string;
  brand?: Record<string, unknown>;
  is_active?: boolean;
}

const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(
    private readonly clients: ClientsRepository,
    private readonly clientAccess: ClientAccessService,
    private readonly assignments: UserClientAssignmentsRepository,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClientDto) {
    return this.clients.create(user.agencyId, body);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const scope = await this.clientAccess.resolveListScope(user);
    if (scope.mode === 'none') return [];
    if (scope.mode === 'single') {
      const client = await this.clients.findById(user.agencyId, scope.clientId);
      return client ? [client] : [];
    }
    if (scope.mode === 'multi') {
      const all = await this.clients.findAll(user.agencyId);
      const allowed = new Set(scope.clientIds);
      return all.filter((c) => allowed.has(c.id));
    }
    return this.clients.findAll(user.agencyId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.clientAccess.assertClientAccess(user, id);
    const client = await this.clients.findById(user.agencyId, id);
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateClientDto,
  ) {
    const client = await this.clients.update(user.agencyId, id, body);
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  /**
   * Adjunta logo de marca del cliente. Se guarda en storage y en clients.brand.logoUrl.
   * Nunca se envía a OpenAI; solo CompositionService (sharp).
   */
  @Post(':id/logo')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.clientAccess.assertClientAccess(user, id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo de logo');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!LOGO_MIMES.has(mime)) {
      throw new BadRequestException('El logo debe ser PNG, JPEG, WebP o GIF');
    }

    const client = await this.clients.findById(user.agencyId, id);
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const ext =
      mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : 'jpg';

    const stored = await this.mediaStorage.save({
      agencyId: user.agencyId,
      buffer: file.buffer,
      extension: ext,
      contentType: mime,
    });

    const brand = parseClientBrand(client.brand);
    const nextBrand: Record<string, unknown> = {
      ...(typeof client.brand === 'object' && client.brand && !Array.isArray(client.brand)
        ? (client.brand as Record<string, unknown>)
        : {}),
      logoUrl: stored.storageUrl,
      layouts: {
        ...brand.layouts,
        [DEFAULT_LAYOUT_KEY]:
          brand.layouts[DEFAULT_LAYOUT_KEY] ?? {
            canvas: { ...DEFAULT_POST_FEED_LAYOUT.canvas },
            logo: { ...DEFAULT_POST_FEED_LAYOUT.logo },
            text: DEFAULT_POST_FEED_LAYOUT.text.map((t) => ({ ...t })),
          },
      },
    };
    if (brand.fonts) nextBrand.fonts = brand.fonts;

    const updated = await this.clients.update(user.agencyId, id, { brand: nextBrand });
    if (!updated) throw new NotFoundException('Cliente no encontrado');

    return {
      logoUrl: stored.storageUrl,
      brand: updated.brand,
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const assignedCount = await this.assignments.countByClientId(user.agencyId, id);
    if (assignedCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar: hay usuarios asignados a este cliente. Reasígnalos o elimínalos primero.',
      );
    }

    const deleted = await this.clients.delete(user.agencyId, id);
    if (!deleted) throw new NotFoundException('Cliente no encontrado');
    return { deleted: true };
  }
}
