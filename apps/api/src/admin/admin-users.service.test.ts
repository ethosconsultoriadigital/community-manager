import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserClientAssignmentsValidationError } from '@cm/db';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  const users = {
    findByAgency: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    findByIdInAgency: vi.fn(),
    setActive: vi.fn(),
    updatePasswordHash: vi.fn(),
    deleteInAgency: vi.fn(),
  };
  const assignments = {
    findByAgency: vi.fn(),
    assign: vi.fn(),
  };

  const service = new AdminUsersService(users as never, assignments as never);
  const actor = {
    id: 'admin-1',
    agencyId: 'agency-1',
    email: 'admin@test.com',
    role: 'admin' as const,
  };

  it('crea usuario y lo asigna al cliente', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: 'user-1',
      email: 'cliente@test.com',
      full_name: 'Cliente',
      role: 'manager',
      is_active: true,
    });
    assignments.assign.mockResolvedValue({
      clients: { id: 'client-1', name: 'Restaurante', is_active: true },
    });

    const result = await service.createUser('agency-1', actor, {
      email: 'cliente@test.com',
      password: 'Password123!',
      fullName: 'Cliente',
      clientId: 'client-1',
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: 'agency-1',
        email: 'cliente@test.com',
        role: 'manager',
      }),
    );
    expect(assignments.assign).toHaveBeenCalledWith('agency-1', {
      userId: 'user-1',
      clientId: 'client-1',
    });
    expect(result.client?.id).toBe('client-1');
  });

  it('elimina usuario si falla la asignación', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'user-2', email: 'x@test.com', role: 'manager' });
    assignments.assign.mockRejectedValue(
      new UserClientAssignmentsValidationError('Cliente no encontrado'),
    );

    await expect(
      service.createUser('agency-1', actor, {
        email: 'x@test.com',
        password: 'Password123!',
        clientId: 'bad-client',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(users.deleteInAgency).toHaveBeenCalledWith('agency-1', 'user-2');
  });

  it('no permite desactivar al owner', async () => {
    users.findByIdInAgency.mockResolvedValue({ id: 'owner-1', role: 'owner' });

    await expect(service.setUserActive('agency-1', 'owner-1', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
