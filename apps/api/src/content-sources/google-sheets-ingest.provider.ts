import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IngestSheetInput,
  IngestSheetResult,
  SheetIngestProvider,
} from './interfaces/sheet-ingest-provider.interface';
import {
  fetchSpreadsheetValues,
  getGoogleAccessToken,
  parseServiceAccountJson,
  resolveSheetTitleByGid,
} from './google-sheets-auth';
import { mapTableToSheetRows } from './map-sheet-rows';
import { RADARMEX_COLUMN_MAP } from './radarmex-columns';

@Injectable()
export class GoogleSheetsIngestProvider implements SheetIngestProvider {
  private readonly logger = new Logger(GoogleSheetsIngestProvider.name);

  constructor(private readonly config: ConfigService) {}

  async fetchRows(input: IngestSheetInput): Promise<IngestSheetResult> {
    const spreadsheetId = String(input.config.spreadsheetId ?? '').trim();
    if (!spreadsheetId) {
      throw new Error('config.spreadsheetId es obligatorio para Google Sheets');
    }

    const saRaw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!saRaw) {
      throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON para leer Google Sheets');
    }

    const sa = parseServiceAccountJson(saRaw);
    const token = await getGoogleAccessToken(sa);

    let sheetTitle =
      typeof input.config.sheetName === 'string' ? input.config.sheetName.trim() : '';
    const gid = input.config.gid != null ? String(input.config.gid).trim() : '';
    if (!sheetTitle && gid) {
      sheetTitle = await resolveSheetTitleByGid(token, spreadsheetId, gid);
    }
    if (!sheetTitle) {
      sheetTitle = 'Sheet1';
    }

    const range = `${sheetTitle}!A:Z`;
    this.logger.log(`Leyendo sheet ${spreadsheetId} rango ${range}`);
    const values = await fetchSpreadsheetValues(token, spreadsheetId, range);

    const columnMap =
      input.config.columnMap === 'radarmex' || !input.config.columnMap
        ? RADARMEX_COLUMN_MAP
        : RADARMEX_COLUMN_MAP;

    return { rows: mapTableToSheetRows(values, columnMap) };
  }
}
