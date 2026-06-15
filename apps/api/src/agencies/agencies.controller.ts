import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AgenciesRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';

class UpdateAgencyDto {
  name!: string;
}

@Controller('agencies')
@UseGuards(JwtAuthGuard)
export class AgenciesController {
  constructor(private readonly agencies: AgenciesRepository) {}

  @Get('me')
  async getMyAgency(@CurrentUser() user: AuthUser) {
    const agency = await this.agencies.findById(user.agencyId);
    if (!agency) throw new NotFoundException('Agencia no encontrada');
    return agency;
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  async updateMyAgency(@CurrentUser() user: AuthUser, @Body() body: UpdateAgencyDto) {
    const agency = await this.agencies.findById(user.agencyId);
    if (!agency) throw new NotFoundException('Agencia no encontrada');
    return this.agencies.update(user.agencyId, body.name);
  }
}
