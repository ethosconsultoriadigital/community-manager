import type { UserRole } from '@/lib/types';

export function isAgencyAdmin(role: UserRole) {
  return role === 'owner' || role === 'admin';
}

export function isClientScopedRole(role: UserRole) {
  return role === 'manager' || role === 'viewer';
}

/**
 * Mostrar selector cuando hay más de un cliente visible:
 * - admin/owner de la agencia
 * - manager/viewer con varios negocios asignados
 */
export function shouldShowClientSelector(role: UserRole, clientCount: number) {
  if (clientCount <= 1) return false;
  return isAgencyAdmin(role) || isClientScopedRole(role);
}
