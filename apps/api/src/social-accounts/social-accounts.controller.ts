import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { SocialAccountsService } from './social-accounts.service';

@Controller('social-accounts')
@UseGuards(JwtAuthGuard)
export class SocialAccountsController {
  constructor(
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly socialAccountsService: SocialAccountsService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    return this.socialAccounts.findByAgency(user.agencyId, clientId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const account = await this.socialAccounts.findById(user.agencyId, id);
    if (!account) throw new NotFoundException('Cuenta social no encontrada');
    return account;
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.socialAccountsService.disconnect(user.agencyId, id);
  }
}
