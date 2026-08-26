import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService passwords', () => {
  const agencies = { create: vi.fn() };
  const users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updatePasswordHashById: vi.fn(),
  };
  const clients = { findAll: vi.fn() };
  const resetTokens = {
    create: vi.fn(),
    findValidByRawToken: vi.fn(),
    markUsed: vi.fn(),
  };
  const email = { sendPasswordResetEmail: vi.fn() };
  const config = { get: vi.fn((key: string) => (key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined)) };
  const jwt = { sign: vi.fn(() => 'token') };

  const service = new AuthService(
    agencies as never,
    users as never,
    clients as never,
    resetTokens as never,
    email as never,
    config as never,
    jwt as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cambia contraseña con la actual correcta', async () => {
    const hash = await bcrypt.hash('OldPass123!', 4);
    users.findById.mockResolvedValue({ id: 'u1', password_hash: hash });
    users.updatePasswordHashById.mockResolvedValue(true);

    const result = await service.changePassword('u1', 'OldPass123!', 'NewPass123!');

    expect(result.passwordChanged).toBe(true);
    expect(users.updatePasswordHashById).toHaveBeenCalled();
  });

  it('rechaza contraseña actual incorrecta', async () => {
    const hash = await bcrypt.hash('OldPass123!', 4);
    users.findById.mockResolvedValue({ id: 'u1', password_hash: hash });

    await expect(
      service.changePassword('u1', 'WrongPass!', 'NewPass123!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forgot-password responde ok aunque el email no exista', async () => {
    users.findByEmail.mockResolvedValue(null);

    const result = await service.requestPasswordReset('ghost@test.com');

    expect(result.requested).toBe(true);
    expect(resetTokens.create).not.toHaveBeenCalled();
  });

  it('forgot-password crea token y envía email', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      is_active: true,
    });

    const result = await service.requestPasswordReset('user@test.com');

    expect(result.requested).toBe(true);
    expect(resetTokens.create).toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@test.com',
      expect.stringContaining('/reset-password?token='),
    );
  });

  it('reset-password con token válido', async () => {
    resetTokens.findValidByRawToken.mockResolvedValue({
      id: 't1',
      users: { id: 'u1', email: 'user@test.com', is_active: true },
    });
    users.updatePasswordHashById.mockResolvedValue(true);

    const result = await service.resetPasswordWithToken('raw-token', 'NewPass123!');

    expect(result.passwordReset).toBe(true);
    expect(resetTokens.markUsed).toHaveBeenCalledWith('t1');
  });

  it('reset-password rechaza token inválido', async () => {
    resetTokens.findValidByRawToken.mockResolvedValue(null);

    await expect(
      service.resetPasswordWithToken('bad', 'NewPass123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
