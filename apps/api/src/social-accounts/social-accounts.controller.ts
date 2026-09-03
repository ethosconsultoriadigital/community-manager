import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SocialAccountsRepository } from '@cm/db';
import type { AuthUser } from '@cm/shared';
import { ClientAccessService } from '../access/client-access.service';
import { filterRowsByClientIds, scopeToClientFilter } from '../access/scope-filters';
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
    private readonly clientAccess: ClientAccessService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    const scope = await this.clientAccess.resolveListScope(user, clientId);
    if (scope.mode === 'none') return [];
    const { clientId: filter, clientIds } = scopeToClientFilter(scope);
    const accounts = await this.socialAccounts.findByAgency(user.agencyId, filter);
    if (clientIds) return filterRowsByClientIds(accounts, clientIds);
    return accounts;
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const account = await this.socialAccounts.findById(user.agencyId, id);
    if (!account) throw new NotFoundException('Cuenta social no encontrada');
    try {
      await this.clientAccess.assertClientAccess(user, account.client_id);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Cuenta social no encontrada');
      }
      throw error;
    }
    return account;
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const account = await this.socialAccounts.findById(user.agencyId, id);
    if (!account) throw new NotFoundException('Cuenta social no encontrada');
    await this.clientAccess.assertClientAccess(user, account.client_id);
    await this.socialAccountsService.disconnect(user.agencyId, id);
  }
}
