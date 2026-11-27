import type { GraphError } from './meta-graph.client';

/** Códigos de Graph que indican token inválido, caducado o sesión rota. */
const TOKEN_CODES = new Set([190, 102, 458, 463, 467]);
/** Códigos de Graph de permisos insuficientes sobre una página. */
const PERMISSION_CODES = new Set([10, 200]);

/**
 * True si el error de Meta indica que hay que volver a conectar la página
 * (token inválido o sin permisos para actuar como esa página).
 */
export function isMetaTokenOrPermissionError(error: unknown): boolean {
  const code = (error as GraphError | undefined)?.code;
  if (
    typeof code === 'number' &&
    (TOKEN_CODES.has(code) || PERMISSION_CODES.has(code))
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /impersonating a user's page/i.test(message) ||
    /pages_show_list/i.test(message) ||
    /pages_read_engagement/i.test(message) ||
    /error validating access token/i.test(message) ||
    /invalid oauth access token/i.test(message) ||
    /session has expired/i.test(message) ||
    /has not authorized/i.test(message) ||
    /permission(?:s)? must be granted/i.test(message) ||
    /not enough permission/i.test(message) ||
    /requires a page access token/i.test(message)
  );
}

export const REQUIERE_RECONEXION = 'requiere_reconexion';
