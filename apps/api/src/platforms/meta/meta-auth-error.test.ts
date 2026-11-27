import { describe, expect, it } from 'vitest';
import { isMetaTokenOrPermissionError } from './meta-auth-error';

function graphError(message: string, code?: number) {
  const err = new Error(message) as Error & { code?: number };
  if (code != null) err.code = code;
  return err;
}

describe('isMetaTokenOrPermissionError', () => {
  it('detecta el error de impersonar una página sin permisos', () => {
    expect(
      isMetaTokenOrPermissionError(
        graphError(
          "Any of the pages_read_engagement, pages_manage_metadata, pages_show_list or pages_messaging permission(s) must be granted before impersonating a user's page.",
        ),
      ),
    ).toBe(true);
  });

  it('detecta tokens inválidos o caducados por código', () => {
    expect(isMetaTokenOrPermissionError(graphError('token', 190))).toBe(true);
    expect(isMetaTokenOrPermissionError(graphError('session', 102))).toBe(true);
    expect(isMetaTokenOrPermissionError(graphError('denied', 10))).toBe(true);
    expect(isMetaTokenOrPermissionError(graphError('denied', 200))).toBe(true);
  });

  it('no marca errores ajenos al token', () => {
    expect(
      isMetaTokenOrPermissionError(graphError('Media id is not available', 9007)),
    ).toBe(false);
    expect(isMetaTokenOrPermissionError(graphError('Duplicate status message'))).toBe(
      false,
    );
    expect(isMetaTokenOrPermissionError('timeout')).toBe(false);
  });
});
