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
import {
  calendarDateInTz,
  isDateInRange,
  isPositiveSentiment,
  parseSheetDate,
  toCalendarDate,
} from './radarmex-columns';

export type IngestResult = {
  ingested: number;
  duplicates: number;
  belowMinScore: number;
  notFlagged: number;
  skippedNoRadarmexUrl: number;
  skippedOutOfDateRange: number;
  dateFrom: string;
  dateTo: string;
  items: Awaited<ReturnType<SourceItemsRepository['findBySource']>>;
};

export type RowFilterReason =
  | 'ok'
  | 'not_flagged'
  | 'below_score'
  | 'no_radarmex_url'
  | 'out_of_range';

export function resolveDateRange(config: Record<string, unknown>): {
  dateFrom: string;
  dateTo: string;
} {
  const today = calendarDateInTz(new Date());
  const fromRaw = typeof config.dateFrom === 'string' ? config.dateFrom.trim() : '';
  const toRaw = typeof config.dateTo === 'string' ? config.dateTo.trim() : '';
  const dateFrom = fromRaw || today;
  const dateTo = toRaw || fromRaw || today;
  return {
    dateFrom,
    dateTo: dateTo < dateFrom ? dateFrom : dateTo,
  };
}

export function rowPassesFilters(
  row: SheetRow,
  minScore: number | null,
  dateFrom: string,
  dateTo: string,
): RowFilterReason {
  if (!row.flagged_publish) return 'not_flagged';

  if (!row.article_url?.trim()) return 'no_radarmex_url';

  const pubKey = toCalendarDate(row.published_at);
  if (!isDateInRange(pubKey, dateFrom, dateTo)) return 'out_of_range';

  const score = row.sentiment_score ?? null;
  const positive = isPositiveSentiment(row.sentiment);
  const scoreOk =
    minScore === null
      ? score !== null && score >= 0
      : score !== null && score >= minScore;
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
    const { dateFrom, dateTo } = resolveDateRange(config);

    let ingested = 0;
    let duplicates = 0;
    let belowMinScore = 0;
    let notFlagged = 0;
    let skippedNoRadarmexUrl = 0;
    let skippedOutOfDateRange = 0;

    for (const row of rows) {
      const filter = rowPassesFilters(row, minScore, dateFrom, dateTo);
      if (filter === 'not_flagged') {
        notFlagged += 1;
        continue;
      }
      if (filter === 'no_radarmex_url') {
        skippedNoRadarmexUrl += 1;
        continue;
      }
      if (filter === 'out_of_range') {
        skippedOutOfDateRange += 1;
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

      // Si se vació la bandeja (rejected) y la fila vuelve a pasar filtros (p. ej. hoy),
      // reabrir como new para que auto-promote la cree de nuevo.
      let nextStatus: 'new' | 'duplicate' | 'rejected' | 'pending_approval' | 'approved' | 'published';
      if (alreadyPromoted) {
        nextStatus = existingByExternal!.status;
      } else if (existingByDedup && existingByDedup.external_id !== row.external_id) {
        nextStatus = 'duplicate';
      } else if (existingByExternal?.status === 'rejected') {
        nextStatus = 'new';
      } else if (existingByExternal) {
        nextStatus = existingByExternal.status;
      } else {
        nextStatus = 'new';
      }

      const item = await this.sourceItems.upsert(agencyId, {
        sourceId,
        clientId: source.client_id,
        externalId: row.external_id,
        capturedAt: parseSheetDate(row.captured_at),
        origin: row.origin,
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
        status: nextStatus,
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

    return {
      ingested,
      duplicates,
      belowMinScore,
      notFlagged,
      skippedNoRadarmexUrl,
      skippedOutOfDateRange,
      dateFrom,
      dateTo,
      items,
    };
  }
}
