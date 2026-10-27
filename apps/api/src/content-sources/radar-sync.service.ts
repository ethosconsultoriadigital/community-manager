import { Injectable } from '@nestjs/common';
import { AabSheetWriteBackService } from './aab-sheet-writeback.service';
import { AutoPromoteService } from './auto-promote.service';
import { IngestionService } from './ingestion.service';

export type SyncSourceResult = {
  ingest: Awaited<ReturnType<IngestionService['ingest']>>;
  promote: Awaited<ReturnType<AutoPromoteService['promoteSource']>>;
};

@Injectable()
export class RadarSyncService {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly autoPromote: AutoPromoteService,
    private readonly aabWriteBack: AabSheetWriteBackService,
  ) {}

  async syncSource(
    agencyId: string,
    userId: string | null,
    sourceId: string,
  ): Promise<SyncSourceResult> {
    const ingest = await this.ingestion.ingest(agencyId, sourceId);
    const promote = await this.autoPromote.promoteSource(agencyId, userId, sourceId);
    await this.aabWriteBack.retrySource(agencyId, sourceId);
    return { ingest, promote };
  }
}
