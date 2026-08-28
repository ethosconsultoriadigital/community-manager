import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AutoPromoteService } from './auto-promote.service';
import { SHEET_INGEST_PROVIDER } from './content-sources.tokens';
import {
  ContentSourcesController,
  SourceItemsController,
} from './content-sources.controller';
import { GoogleSheetsIngestProvider } from './google-sheets-ingest.provider';
import { HybridSheetIngestProvider } from './hybrid-sheet-ingest.provider';
import { IngestionService } from './ingestion.service';
import { MockSheetIngestProvider } from './mocks/mock-sheet-ingest.provider';
import { PromoteItemService } from './promote-item.service';
import { RadarSyncService } from './radar-sync.service';

@Module({
  imports: [MediaModule],
  controllers: [ContentSourcesController, SourceItemsController],
  providers: [
    IngestionService,
    PromoteItemService,
    AutoPromoteService,
    RadarSyncService,
    PurgeInvalidPendingService,
    GoogleSheetsIngestProvider,
    MockSheetIngestProvider,
    HybridSheetIngestProvider,
    { provide: SHEET_INGEST_PROVIDER, useExisting: HybridSheetIngestProvider },
  ],
  exports: [RadarSyncService, IngestionService, AutoPromoteService],
})
export class ContentSourcesModule {}
