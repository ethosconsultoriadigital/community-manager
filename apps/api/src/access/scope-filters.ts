import type { ClientListScope } from './client-access.service';

/** Filtro de client_id para listados a partir del scope resuelto. */
export function scopeToClientFilter(scope: ClientListScope): {
  /** Un solo cliente, o undefined = sin filtro (solo agency-wide all). */
  clientId?: string;
  /** Varios clientes permitidos (manager multi). */
  clientIds?: string[];
} {
  if (scope.mode === 'single') return { clientId: scope.clientId };
  if (scope.mode === 'multi') return { clientIds: scope.clientIds };
  return {};
}

export function filterRowsByClientIds<T extends { client_id: string }>(
  rows: T[],
  clientIds: string[],
): T[] {
  const allowed = new Set(clientIds);
  return rows.filter((row) => allowed.has(row.client_id));
}
