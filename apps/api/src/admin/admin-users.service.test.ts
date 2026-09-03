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
    updateProfile: vi.fn(),
    deleteInAgency: vi.fn(),
  };
  const assignments = {
    findByAgency: vi.fn(),
    assign: vi.fn(),
    setClients: vi.fn(),
    reassign: vi.fn(),
    removeByUserId: vi.fn(),
  };

  const service = new AdminUsersService(users as never, assignments as never);
  const actor = {
    id: 'admin-1',
    agencyId: 'agency-1',
    email: 'admin@test.com',
    role: 'admin' as const,
  };

  it('crea usuario y lo asigna a uno o más clientes', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: 'user-1',
      email: 'cliente@test.com',
      full_name: 'Cliente',
      role: 'manager',
      is_active: true,
    });
    assignments.setClients.mockResolvedValue([
      { clients: { id: 'client-1', name: 'Restaurante', is_active: true } },
      { clients: { id: 'client-2', name: 'Hotel', is_active: true } },
    ]);

    const result = await service.createUser('agency-1', actor, {
      email: 'cliente@test.com',
      password: 'Password123!',
      fullName: 'Cliente',
      clientIds: ['client-1', 'client-2'],
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: 'agency-1',
        email: 'cliente@test.com',
        role: 'manager',
      }),
    );
    expect(assignments.setClients).toHaveBeenCalledWith('agency-1', 'user-1', [
      'client-1',
      'client-2',
    ]);
    expect(result.clients).toHaveLength(2);
    expect(result.client?.id).toBe('client-1');
  });

  it('elimina usuario si falla la asignación', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'user-2', email: 'x@test.com', role: 'manager' });
    assignments.setClients.mockRejectedValue(
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

  it('actualiza nombre, rol y clientes de un manager', async () => {
    users.findByIdInAgency.mockResolvedValue({ id: 'user-1', role: 'manager' });
    users.updateProfile.mockResolvedValue(true);
    assignments.setClients.mockResolvedValue([
      { clients: { id: 'client-2', name: 'Otro', is_active: true } },
    ]);
    users.findByAgency.mockResolvedValue([
      {
        id: 'user-1',
        email: 'mgr@test.com',
        full_name: 'Nuevo',
        role: 'viewer',
        is_active: true,
        created_at: new Date(),
      },
    ]);
    assignments.findByAgency.mockResolvedValue([
      {
        user_id: 'user-1',
        clients: { id: 'client-2', name: 'Otro', is_active: true },
      },
    ]);

    const result = await service.updateUser('agency-1', 'user-1', {
      fullName: 'Nuevo',
      role: 'viewer',
      clientIds: ['client-2'],
    });

    expect(users.updateProfile).toHaveBeenCalledWith('agency-1', 'user-1', {
      fullName: 'Nuevo',
      role: 'viewer',
    });
    expect(assignments.setClients).toHaveBeenCalledWith('agency-1', 'user-1', ['client-2']);
    expect(result.role).toBe('viewer');
    expect(result.clients[0]?.id).toBe('client-2');
  });

  it('crea usuario owner sin cliente asignado', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: 'owner-2',
      email: 'amed@test.com',
      full_name: 'Amed',
      role: 'owner',
      is_active: true,
    });
    assignments.setClients.mockClear();

    const result = await service.createUser('agency-1', actor, {
      email: 'amed@test.com',
      password: 'Password123!',
      fullName: 'Amed',
      role: 'owner',
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner' }),
    );
    expect(assignments.setClients).not.toHaveBeenCalled();
    expect(result.role).toBe('owner');
    expect(result.clients).toEqual([]);
  });

  it('promueve admin a owner y limpia asignación de cliente', async () => {
    users.findByIdInAgency.mockResolvedValue({ id: 'user-admin', role: 'admin' });
    users.updateProfile.mockResolvedValue(true);
    assignments.removeByUserId.mockResolvedValue(true);
    users.findByAgency.mockResolvedValue([
      {
        id: 'user-admin',
        email: 'amed@test.com',
        full_name: 'Amed',
        role: 'owner',
        is_active: true,
        created_at: new Date(),
      },
    ]);
    assignments.findByAgency.mockResolvedValue([]);

    const result = await service.updateUser('agency-1', 'user-admin', {
      role: 'owner',
    });

    expect(users.updateProfile).toHaveBeenCalledWith('agency-1', 'user-admin', {
      role: 'owner',
    });
    expect(assignments.removeByUserId).toHaveBeenCalledWith('agency-1', 'user-admin');
    expect(result.role).toBe('owner');
    expect(result.clients).toEqual([]);
  });

  it('elimina usuario y su asignación', async () => {
    users.findByIdInAgency.mockResolvedValue({ id: 'user-3', role: 'manager' });
    assignments.removeByUserId.mockResolvedValue(true);
    users.deleteInAgency.mockResolvedValue(true);

    const result = await service.deleteUser('agency-1', 'admin-1', 'user-3');

    expect(assignments.removeByUserId).toHaveBeenCalledWith('agency-1', 'user-3');
    expect(users.deleteInAgency).toHaveBeenCalledWith('agency-1', 'user-3');
    expect(result.deleted).toBe(true);
  });

  it('no permite eliminar el propio usuario', async () => {
    await expect(service.deleteUser('agency-1', 'admin-1', 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
