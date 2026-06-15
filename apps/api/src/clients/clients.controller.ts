import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
  constructor(private readonly clients: ClientsRepository) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClientDto) {
    return this.clients.create(user.agencyId, body);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.clients.findAll(user.agencyId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const client = await this.clients.findById(user.agencyId, id);
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  @Patch(':id')
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
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const deleted = await this.clients.delete(user.agencyId, id);
    if (!deleted) throw new NotFoundException('Cliente no encontrado');
    return { deleted: true };
  }
}
