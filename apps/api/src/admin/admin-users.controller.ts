import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AdminUsersService } from './admin-users.service';

class CreateAdminUserDto {
  email!: string;
  password!: string;
  fullName?: string;
  role?: 'manager' | 'viewer';
  clientId!: string;
}

class ResetPasswordDto {
  password!: string;
}

class UpdateAdminUserDto {
  fullName?: string;
  role?: 'manager' | 'viewer';
  clientId?: string;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'admin')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.adminUsers.listUsers(user.agencyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAdminUserDto) {
    return this.adminUsers.createUser(user.agencyId, user, body);
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminUsers.setUserActive(user.agencyId, id, false);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminUsers.setUserActive(user.agencyId, id, true);
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.adminUsers.resetPassword(user.agencyId, id, body.password);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
  ) {
    return this.adminUsers.updateUser(user.agencyId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminUsers.deleteUser(user.agencyId, user.id, id);
  }
}
