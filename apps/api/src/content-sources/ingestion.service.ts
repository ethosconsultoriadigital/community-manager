import { Inject, Injectable } from '@nestjs/common';
import {
  ContentSourcesRepository,
  SourceItemsRepository,
} from '@cm/db';
import { SHEET_INGEST_PROVIDER } from './content-sources.tokens';
import {
  computeDedupHash,
} from './mocks/mock-sheet-ingest.provider';
import type { SheetIngestProvider, SheetRow } from './interfaces/sheet-ingest-provider.interface';
import { isPositiveSentiment, parseSheetDate } from './radarmex-columns';

export type IngestResult = {
  ingested: number;
  duplicates: number;
  belowMinScore: number;
  notFlagged: number;
  items: Awaited<ReturnType<SourceItemsRepository['findBySource']>>;
};

function rowPassesFilters(
  row: SheetRow,
  minScore: number | null,
): 'ok' | 'not_flagged' | 'below_score' {
  if (!row.flagged_publish) return 'not_flagged';
  const score = row.sentiment_score ?? null;
  const positive = isPositiveSentiment(row.sentiment);
  const scoreOk = minScore === null ? score !== null && score >= 0 : score !== null && score >= minScore;
  if (positive || scoreOk) return 'ok';
  return 'below_score';
}

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
      throw new Error(`Tipo de fuente no soportado para ingesta: ${source.type}`);
    }

    const config =
      source.config && typeof source.config === 'object' && !Array.isArray(source.config)
        ? (source.config as Record<string, unknown>)
        : {};

    const { rows } = await this.sheet.fetchRows({ config });
    const minScore = source.min_score != null ? Number(source.min_score) : 0.7;

    let ingested = 0;
    let duplicates = 0;
    let belowMinScore = 0;
    let notFlagged = 0;

    for (const row of rows) {
      const filter = rowPassesFilters(row, minScore);
      if (filter === 'not_flagged') {
        notFlagged += 1;
        continue;
      }
      if (filter === 'below_score') {
        belowMinScore += 1;
        continue;
      }

      const dedupHash = computeDedupHash(row);
      const existingByDedup = await this.sourceItems.findByDedupHash(
        agencyId,
        sourceId,
        dedupHash,
      );
      const existingByExternal = await this.sourceItems.findByExternalId(
        agencyId,
        sourceId,
        row.external_id,
      );
      const alreadyPromoted = Boolean(
        existingByExternal?.post_id || existingByExternal?.status === 'published',
      );

      const item = await this.sourceItems.upsert(agencyId, {
        sourceId,
        clientId: source.client_id,
        externalId: row.external_id,
        capturedAt: parseSheetDate(row.captured_at),
        origin: row.origin,
        // Enlace del post: solo url_radarmex (nunca url_original de El Universal, etc.)
        sourceUrl: row.article_url?.trim() || null,
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
        status: alreadyPromoted
          ? existingByExternal!.status
          : existingByDedup && existingByDedup.external_id !== row.external_id
            ? 'duplicate'
            : existingByExternal
              ? existingByExternal.status
              : 'new',
        preservePromotion: alreadyPromoted,
      });

      if (item.status === 'duplicate') {
        duplicates += 1;
      } else if (!existingByExternal) {
        ingested += 1;
      }
    }

    const items = await this.sourceItems.findBySource(agencyId, sourceId, {
      minScore: minScore ?? undefined,
    });

    return { ingested, duplicates, belowMinScore, notFlagged, items };
  }
}
