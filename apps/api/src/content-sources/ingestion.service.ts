import { Inject, Injectable } from '@nestjs/common';
import {
  ContentSourcesRepository,
  SourceItemsRepository,
} from '@cm/db';
import { SHEET_INGEST_PROVIDER } from './content-sources.tokens';
import {
  computeDedupHash,
} from './mocks/mock-sheet-ingest.provider';
import type { SheetIngestProvider } from './interfaces/sheet-ingest-provider.interface';

export type IngestResult = {
  ingested: number;
  duplicates: number;
  belowMinScore: number;
  items: Awaited<ReturnType<SourceItemsRepository['findBySource']>>;
};

@Injectable()
export class IngestionService {
  constructor(
    private readonly contentSources: ContentSourcesRepository,
    private readonly sourceItems: SourceItemsRepository,
    @Inject(SHEET_INGEST_PROVIDER) private readonly sheet: SheetIngestProvider,
  ) {}

  async ingest(agencyId: string, sourceId: string): Promise<IngestResult> {
    const source = await this.contentSources.findById(agencyId, sourceId);
    if (!source) {
      throw new Error('Fuente de contenido no encontrada');
    }
    if (!source.is_active) {
      throw new Error('La fuente de contenido está inactiva');
    }
    if (source.type !== 'sheet' && source.type !== 'news_radar') {
      throw new Error(`Tipo de fuente no soportado para ingesta mock: ${source.type}`);
    }

    const config =
      source.config && typeof source.config === 'object' && !Array.isArray(source.config)
        ? (source.config as Record<string, unknown>)
        : {};

    const { rows } = await this.sheet.fetchRows({ config });
    const minScore = source.min_score ? Number(source.min_score) : null;

    let ingested = 0;
    let duplicates = 0;
    let belowMinScore = 0;

    for (const row of rows) {
      const score = row.sentiment_score ?? null;
      const passesScore = minScore === null || (score !== null && score >= minScore);
      if (!passesScore) {
        belowMinScore += 1;
        continue;
      }

      const dedupHash = computeDedupHash(row);
      const existingByDedup = await this.sourceItems.findByDedupHash(
        agencyId,
        sourceId,
        dedupHash,
      );

      const item = await this.sourceItems.upsert(agencyId, {
        sourceId,
        clientId: source.client_id,
        externalId: row.external_id,
        capturedAt: row.captured_at ? new Date(row.captured_at) : null,
        origin: row.origin,
        sourceUrl: row.source_url,
        title: row.title,
        summary: row.summary,
        category: row.category,
        sentiment: row.sentiment,
        sentimentScore: row.sentiment_score,
        sentimentReason: row.sentiment_reason,
        imageUrl: row.image_url,
        copyFacebook: row.copy_facebook,
        copyInstagram: row.copy_instagram,
        copyX: row.copy_x,
        hashtags: row.hashtags ?? [],
        flaggedPublish: row.flagged_publish ?? false,
        dedupHash,
        status: existingByDedup ? 'duplicate' : 'new',
      });

      if (item.status === 'duplicate') {
        duplicates += 1;
      } else {
        ingested += 1;
      }
    }

    const items = await this.sourceItems.findBySource(agencyId, sourceId, {
      minScore: minScore ?? undefined,
    });

    return { ingested, duplicates, belowMinScore, items };
  }
}
