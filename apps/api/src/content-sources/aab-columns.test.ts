import { describe, expect, it } from 'vitest';
import {
  columnLetter,
  formatSheetDateTime,
  isGoogleDriveFileUrl,
  parseDriveFileId,
  resolveAabSheetStatus,
} from './aab-columns';
import { GOOGLE_API_SCOPES } from './google-sheets-auth';

describe('estado de redes AAB', () => {
  it('se queda en aprobación mientras haya un post abierto', () => {
    expect(
      resolveAabSheetStatus([
        { status: 'published' },
        { status: 'pending_approval', approvalStatus: 'pending' },
      ]),
    ).toBe('En aprobación');
  });

  it('Publicado si al cerrar al menos uno salió', () => {
    expect(
      resolveAabSheetStatus([
        { status: 'published' },
        { status: 'failed' },
        { status: 'draft', approvalStatus: 'rejected' },
      ]),
    ).toBe('Publicado');
  });

  it('Error si ninguno se publicó y alguno falló', () => {
    expect(
      resolveAabSheetStatus([
        { status: 'failed' },
        { status: 'draft', approvalStatus: 'rejected' },
      ]),
    ).toBe('Error');
  });

  it('Omitido solo cuando todos fueron rechazados', () => {
    expect(
      resolveAabSheetStatus([
        { status: 'draft', approvalStatus: 'rejected' },
        { status: 'draft', approvalStatus: 'rejected' },
      ]),
    ).toBe('Omitido');
    expect(resolveAabSheetStatus([])).toBeNull();
  });

  it('formatea fecha en Ciudad de México', () => {
    expect(formatSheetDateTime(new Date('2026-10-27T06:10:00.000Z'))).toBe('27/10/2026 00:10');
  });

  it('lee el id de Drive en /file/d/ y en ?id=', () => {
    expect(parseDriveFileId('https://drive.google.com/file/d/abc_DEF-1/view?usp=sharing')).toBe(
      'abc_DEF-1',
    );
    expect(parseDriveFileId('https://drive.google.com/open?id=xyz123')).toBe('xyz123');
    expect(parseDriveFileId('https://cdn.example.com/a.jpg')).toBeNull();
    expect(isGoogleDriveFileUrl('https://drive.google.com/uc?id=xyz123&export=download')).toBe(
      true,
    );
  });

  it('la columna 27 es AA', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});

describe('scopes de Google', () => {
  it('puede escribir el sheet y leer Drive, y sigue pudiendo leer RadarMex', () => {
    expect(GOOGLE_API_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(GOOGLE_API_SCOPES).not.toContain('spreadsheets.readonly');
    expect(GOOGLE_API_SCOPES).toContain('https://www.googleapis.com/auth/drive.readonly');
  });
});
