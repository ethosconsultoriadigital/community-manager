import { AAB_COLUMN_MAP, columnLetter, quoteSheetTitle } from './aab-columns';
import { mapTableToSheetRows } from './map-sheet-rows';
import { normalizeHeader } from './radarmex-columns';

export type SheetCellUpdate = {
  range: string;
  values: string[][];
};

/**
 * Localiza la fila por external_id (recalculado) y apunta solo a
 * estado_redes y fecha_redes. Null si la fila o las columnas no están.
 */
export function planAabCellUpdates(
  table: string[][],
  externalId: string,
  status: string,
  fecha: string,
  sheetTitle: string,
): SheetCellUpdate[] | null {
  if (table.length < 2) return null;
  const rows = mapTableToSheetRows(table, AAB_COLUMN_MAP, { profile: 'aab' });
  const row = rows.find((candidate) => candidate.external_id === externalId);
  if (!row?.sheet_row) return null;

  const headers = table[0].map((header) => normalizeHeader(header));
  const estadoCol = headers.indexOf('estadoredes');
  const fechaCol = headers.indexOf('fecharedes');
  if (estadoCol < 0 || fechaCol < 0) return null;

  const quoted = quoteSheetTitle(sheetTitle);
  return [
    {
      range: `${quoted}!${columnLetter(estadoCol)}${row.sheet_row}`,
      values: [[status]],
    },
    {
      range: `${quoted}!${columnLetter(fechaCol)}${row.sheet_row}`,
      values: [[fecha]],
    },
  ];
}
