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
  UseGuards,
} from '@nestjs/common';
import { ClientsRepository, UserClientAssignmentsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';

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

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(
    private readonly clients: ClientsRepository,
    private readonly clientAccess: ClientAccessService,
    private readonly assignments: UserClientAssignmentsRepository,
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
