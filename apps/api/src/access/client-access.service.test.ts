import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ClientAccessService } from './client-access.service';

describe('ClientAccessService', () => {
  const assignments = {
    findAllByUserId: vi.fn(),
    findByUserId: vi.fn(),
  };
  const service = new ClientAccessService(assignments as never);

  const admin = {
    id: 'u-admin',
    agencyId: 'agency-1',
    email: 'admin@test.com',
    role: 'admin' as const,
  };

  const manager = {
    id: 'u-manager',
    agencyId: 'agency-1',
    email: 'manager@test.com',
    role: 'manager' as const,
  };

  it('admin ve todos los clientes sin filtro', async () => {
    const scope = await service.resolveListScope(admin);
    expect(scope).toEqual({ mode: 'all' });
  });

  it('manager solo ve su cliente asignado', async () => {
    assignments.findAllByUserId.mockResolvedValue([{ client_id: 'client-a' }]);

    const scope = await service.resolveListScope(manager);
    expect(scope).toEqual({ mode: 'single', clientId: 'client-a' });
  });

  it('manager con varios clientes lista en modo multi', async () => {
    assignments.findAllByUserId.mockResolvedValue([
      { client_id: 'client-a' },
      { client_id: 'client-b' },
    ]);

    const scope = await service.resolveListScope(manager);
    expect(scope).toEqual({ mode: 'multi', clientIds: ['client-a', 'client-b'] });
  });

  it('manager con varios puede filtrar por uno permitido', async () => {
    assignments.findAllByUserId.mockResolvedValue([
      { client_id: 'client-a' },
      { client_id: 'client-b' },
    ]);

    const scope = await service.resolveListScope(manager, 'client-b');
    expect(scope).toEqual({ mode: 'single', clientId: 'client-b' });
  });

  it('manager no puede pedir otro clientId', async () => {
    assignments.findAllByUserId.mockResolvedValue([{ client_id: 'client-a' }]);

    await expect(
      service.resolveListScope(manager, 'client-b'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('manager sin asignacion no ve nada', async () => {
    assignments.findAllByUserId.mockResolvedValue([]);

    const scope = await service.resolveListScope(manager);
    expect(scope).toEqual({ mode: 'none' });
  });

  it('assertClientAccess bloquea acceso cruzado', async () => {
    assignments.findAllByUserId.mockResolvedValue([{ client_id: 'client-a' }]);

    await expect(service.assertClientAccess(manager, 'client-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.assertClientAccess(manager, 'client-a')).resolves.toBeUndefined();
  });
});
