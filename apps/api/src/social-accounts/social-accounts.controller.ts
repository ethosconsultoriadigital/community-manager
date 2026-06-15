import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';

@Controller('social-accounts')
@UseGuards(JwtAuthGuard)
export class SocialAccountsController {
  constructor(private readonly socialAccounts: SocialAccountsRepository) {}

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
}
