import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AgenciesRepository,
  ClientsRepository,
  PasswordResetTokensRepository,
  UsersRepository,
} from '@cm/db';
import type { AuthUser } from '@cm/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { EmailService } from '../email/email.service';
import type { AuthResponse, JwtPayload, SafeUser } from './auth.types';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly agencies: AgenciesRepository,
    private readonly users: UsersRepository,
    private readonly clients: ClientsRepository,
    private readonly resetTokens: PasswordResetTokensRepository,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    agencyName: string;
    email: string;
    password: string;
    fullName?: string;
  }): Promise<AuthResponse> {
    const email = input.email.toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const agency = await this.agencies.create(input.agencyName);
    const user = await this.users.create({
      agencyId: agency.id,
      email,
      passwordHash,
      fullName: input.fullName,
      role: 'owner',
    });

    return this.buildAuthResponse(user, agency);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.is_active === false) {
      throw new UnauthorizedException('Cuenta desactivada. Contacta al administrador.');
    }

    return this.buildAuthResponse(user, user.agencies);
  }

  async getProfile(userId: string): Promise<AuthResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return this.buildAuthResponse(user, user.agencies);
  }

  /** Verifica que el usuario autenticado solo accede a datos de su agencia. */
  async getAgencyClients(authUser: AuthUser) {
    return this.clients.findAll(authUser.agencyId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword?.trim() || newPassword.length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres');
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.users.updatePasswordHashById(userId, passwordHash);
    if (!updated) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return { passwordChanged: true };
  }

  async requestPasswordReset(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Email obligatorio');
    }

    const user = await this.users.findByEmail(normalized);
    if (!user || user.is_active === false) {
      return { requested: true };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.resetTokens.create(user.id, rawToken, expiresAt);

    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '')
      ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.email.sendPasswordResetEmail(user.email, resetUrl);
    } catch {
      throw new BadRequestException(
        'No se pudo enviar el correo. Contacta al administrador o revisa la configuración de email.',
      );
    }

    return { requested: true };
  }

  async resetPasswordWithToken(rawToken: string, newPassword: string) {
    if (!rawToken?.trim()) {
      throw new BadRequestException('Token inválido');
    }
    if (!newPassword?.trim() || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const row = await this.resetTokens.findValidByRawToken(rawToken.trim());
    if (!row?.users || row.users.is_active === false) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.updatePasswordHashById(row.users.id, passwordHash);
    await this.resetTokens.markUsed(row.id);
    return { passwordReset: true };
  }

  private buildAuthResponse(
    user: {
      id: string;
      email: string;
      full_name: string | null;
      role: AuthUser['role'];
      agency_id: string;
    },
    agency: { id: string; name: string },
  ): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      agencyId: user.agency_id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwt.sign(payload);

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      agencyId: user.agency_id,
    };

    return {
      accessToken,
      user: safeUser,
      agency: { id: agency.id, name: agency.name },
    };
  }
}
