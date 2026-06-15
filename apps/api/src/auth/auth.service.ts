import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AgenciesRepository,
  ClientsRepository,
  UsersRepository,
} from '@cm/db';
import type { AuthUser } from '@cm/shared';
import * as bcrypt from 'bcryptjs';
import type { AuthResponse, JwtPayload, SafeUser } from './auth.types';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly agencies: AgenciesRepository,
    private readonly users: UsersRepository,
    private readonly clients: ClientsRepository,
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
