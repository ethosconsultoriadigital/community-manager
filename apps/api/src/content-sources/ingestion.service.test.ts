import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  it('exige publicar=true y score/sentimiento positivo', async () => {
    const source = {
      id: 'source-1',
      client_id: 'client-1',
      type: 'sheet',
      is_active: true,
      min_score: 0.7,
      config: { useMock: true },
    };

    const contentSources = {
      findById: vi.fn().mockResolvedValue(source),
    };
    const sourceItems = {
      findByDedupHash: vi.fn().mockResolvedValue(null),
      findByExternalId: vi.fn().mockResolvedValue(null),
      upsert: vi
        .fn()
        .mockResolvedValueOnce({ id: 'i1', status: 'new', external_id: 'noticia_001' })
        .mockResolvedValueOnce({ id: 'i2', status: 'new', external_id: 'noticia_003' }),
      findBySource: vi.fn().mockResolvedValue([
        { id: 'i1', sentiment_score: 0.82 },
        { id: 'i2', sentiment_score: 0.91 },
      ]),
    };
    const sheet = {
      fetchRows: vi.fn().mockResolvedValue({
        rows: [
          {
            external_id: 'noticia_001',
            sentiment_score: 0.82,
            sentiment: 'Positivo',
            flagged_publish: true,
            title: 'A',
          },
          {
            external_id: 'noticia_002',
            sentiment_score: 0.91,
            sentiment: 'Positivo',
            flagged_publish: false,
            title: 'B',
          },
          {
            external_id: 'noticia_003',
            sentiment_score: 0.91,
            sentiment: 'Positivo',
            flagged_publish: true,
            title: 'C',
          },
          {
            external_id: 'noticia_004',
            sentiment_score: 0.4,
            sentiment: 'Neutral',
            flagged_publish: true,
            title: 'D',
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

    expect(result.ingested).toBe(2);
    expect(result.notFlagged).toBe(1);
    expect(result.belowMinScore).toBe(1);
    expect(sourceItems.upsert).toHaveBeenCalledTimes(2);
  });
});
