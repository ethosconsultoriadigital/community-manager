import type { UserRole } from '@/lib/types';

export function isAgencyAdmin(role: UserRole) {
  return role === 'owner' || role === 'admin';
}

export function isClientScopedRole(role: UserRole) {
  return role === 'manager' || role === 'viewer';
}

/** Selector solo si el usuario administra la agencia y hay más de un cliente. */
export function shouldShowClientSelector(role: UserRole, clientCount: number) {
  return isAgencyAdmin(role) && clientCount > 1;
}
