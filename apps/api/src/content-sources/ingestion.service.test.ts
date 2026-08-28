import { describe, expect, it, vi } from 'vitest';
import { IngestionService, rowPassesFilters, resolveDateRange } from './ingestion.service';
import { calendarDateInTz } from './radarmex-columns';

describe('IngestionService filters', () => {
  it('resolveDateRange usa hoy si no hay config', () => {
    const today = calendarDateInTz(new Date());
    expect(resolveDateRange({})).toEqual({ dateFrom: today, dateTo: today });
    expect(resolveDateRange({ dateFrom: '2026-08-01', dateTo: '2026-08-10' })).toEqual({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-10',
    });
  });

  it('exige url_radarmex y fecha_publicacion en rango', () => {
    const today = calendarDateInTz(new Date());
    const base = {
      external_id: 'n1',
      flagged_publish: true,
      sentiment: 'Positivo',
      sentiment_score: 0.9,
      article_url: 'https://www.radarmex.mx/nota/1',
      published_at: today,
    };
    expect(rowPassesFilters(base, 0.7, today, today)).toBe('ok');
    expect(
      rowPassesFilters({ ...base, article_url: '' }, 0.7, today, today),
    ).toBe('no_radarmex_url');
    expect(
      rowPassesFilters({ ...base, published_at: '2020-01-01' }, 0.7, today, today),
    ).toBe('out_of_range');
  });

  it('filtra e ingesta solo filas válidas', async () => {
    const today = calendarDateInTz(new Date());
    const source = {
      id: 'source-1',
      client_id: 'client-1',
      type: 'sheet',
      is_active: true,
      min_score: 0.7,
      config: { useMock: true, dateFrom: today, dateTo: today },
    };

    const contentSources = { findById: vi.fn().mockResolvedValue(source) };
    const sourceItems = {
      findByDedupHash: vi.fn().mockResolvedValue(null),
      findByExternalId: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'i1', status: 'new', external_id: 'n1' }),
      findBySource: vi.fn().mockResolvedValue([{ id: 'i1' }]),
    };
    const sheet = {
      fetchRows: vi.fn().mockResolvedValue({
        rows: [
          {
            external_id: 'n1',
            flagged_publish: true,
            sentiment: 'Positivo',
            sentiment_score: 0.9,
            article_url: 'https://radarmex.mx/a',
            published_at: today,
            title: 'OK',
          },
          {
            external_id: 'n2',
            flagged_publish: true,
            sentiment: 'Positivo',
            sentiment_score: 0.9,
            article_url: '',
            published_at: today,
            title: 'Sin URL',
          },
          {
            external_id: 'n3',
            flagged_publish: true,
            sentiment: 'Positivo',
            sentiment_score: 0.9,
            article_url: 'https://radarmex.mx/b',
            published_at: '2020-01-01',
            title: 'Vieja',
          },
        ],
      }),
    };

    const service = new IngestionService(
      contentSources as never,
      sourceItems as never,
      sheet as never,
    );
    const result = await service.ingest('agency-1', 'source-1');
    expect(result.ingested).toBe(1);
    expect(result.skippedNoRadarmexUrl).toBe(1);
    expect(result.skippedOutOfDateRange).toBe(1);
  });
});
