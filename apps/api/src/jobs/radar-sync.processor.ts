import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ContentSourcesRepository } from '@cm/db';
import { RadarSyncService } from '../content-sources/radar-sync.service';
import { RADAR_SYNC_QUEUE } from './radar-sync.constants';

@Processor(RADAR_SYNC_QUEUE)
export class RadarSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(RadarSyncProcessor.name);

  constructor(
    private readonly contentSources: ContentSourcesRepository,
    private readonly radarSync: RadarSyncService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const sources = await this.contentSources.findActiveSheetSources();
    this.logger.log(`Radar sync: ${sources.length} fuente(s) activa(s)`);

    for (const source of sources) {
      try {
        const result = await this.radarSync.syncSource(source.agency_id, null, source.id);
        this.logger.log(
          `Fuente ${source.id}: ingest=${result.ingest.ingested} posts=${result.promote.postsCreated}`,
        );
      } catch (err) {
        this.logger.warn(
          `Fallo sync fuente ${source.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
