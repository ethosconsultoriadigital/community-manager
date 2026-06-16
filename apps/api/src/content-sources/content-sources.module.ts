import { Module } from '@nestjs/common';
import { SHEET_INGEST_PROVIDER } from './content-sources.tokens';
import {
  ContentSourcesController,
  SourceItemsController,
} from './content-sources.controller';
import { IngestionService } from './ingestion.service';
import { MockSheetIngestProvider } from './mocks/mock-sheet-ingest.provider';
import { PromoteItemService } from './promote-item.service';

@Module({
  controllers: [ContentSourcesController, SourceItemsController],
  providers: [
    IngestionService,
    PromoteItemService,
    { provide: SHEET_INGEST_PROVIDER, useClass: MockSheetIngestProvider },
  ],
})
export class ContentSourcesModule {}
