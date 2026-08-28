import { Injectable } from '@nestjs/common';
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
  ) {}

  async syncSource(
    agencyId: string,
    userId: string | null,
    sourceId: string,
  ): Promise<SyncSourceResult> {
    const ingest = await this.ingestion.ingest(agencyId, sourceId);
    const promote = await this.autoPromote.promoteSource(agencyId, userId, sourceId);
    return { ingest, promote };
  }
}
