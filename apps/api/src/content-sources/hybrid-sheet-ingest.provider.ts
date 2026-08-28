import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IngestSheetInput,
  IngestSheetResult,
  SheetIngestProvider,
} from './interfaces/sheet-ingest-provider.interface';
import { GoogleSheetsIngestProvider } from './google-sheets-ingest.provider';
import { MockSheetIngestProvider } from './mocks/mock-sheet-ingest.provider';

/**
 * Usa Google Sheets si hay GOOGLE_SERVICE_ACCOUNT_JSON y spreadsheetId en config;
 * si no, mock (fixture) para desarrollo/CI.
 */
@Injectable()
export class HybridSheetIngestProvider implements SheetIngestProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly google: GoogleSheetsIngestProvider,
    private readonly mock: MockSheetIngestProvider,
  ) {}

  async fetchRows(input: IngestSheetInput): Promise<IngestSheetResult> {
    const spreadsheetId = String(input.config.spreadsheetId ?? '').trim();
    const forceMock = input.config.useMock === true;
    if (!forceMock && spreadsheetId && this.hasGoogleCredentials()) {
      return this.google.fetchRows(input);
    }
    return this.mock.fetchRows(input);
  }

  private hasGoogleCredentials(): boolean {
    return Boolean(this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim());
  }
}
