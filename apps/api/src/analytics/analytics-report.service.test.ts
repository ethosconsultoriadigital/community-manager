import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsSummary } from '@cm/db';
import { MockLlmProvider } from '../ai/mocks/mock-providers';
import { AnalyticsReportService } from './analytics-report.service';

const emptySummary: AnalyticsSummary = {
  publishedTargets: 2,
  withMetrics: 1,
  totals: {
    impressions: 100,
    reach: 80,
    likes: 10,
    comments: 2,
    shares: 1,
    saves: 0,
    engagement: 13,
  },
  byPlatform: {
    facebook: {
      impressions: 60,
      reach: 50,
      likes: 6,
      comments: 1,
      shares: 1,
      saves: 0,
      engagement: 8,
      publishedTargets: 1,
      withMetrics: 1,
    },
  },
  metricBreakdown: {
    likes: 10,
    comments: 2,
    shares: 1,
    saves: 0,
    impressions: 100,
    reach: 80,
  },
  topPosts: [
    {
      postId: 'post-1',
      caption: 'Test post',
      clientId: 'client-1',
      engagement: 8,
      impressions: 60,
      likes: 6,
      comments: 1,
      platform: 'facebook',
      storageUrl: null,
    },
  ],
};

describe('AnalyticsReportService', () => {
  it('genera un PDF no vacío con narrativa mock', async () => {
    const insights = {
      findSummary: vi.fn().mockResolvedValue(emptySummary),
    };
    const clients = { findById: vi.fn().mockResolvedValue({ name: 'Cliente Demo' }) };
    const generations = {
      create: vi.fn().mockResolvedValue({ id: 'gen-1' }),
      updateStatus: vi.fn().mockResolvedValue({}),
    };
    const llm = new MockLlmProvider();

    const service = new AnalyticsReportService(
      insights as never,
      clients as never,
      generations as never,
      llm,
    );

    const pdf = await service.generatePdf({
      agencyId: 'agency-1',
      userId: 'user-1',
      clientId: 'client-1',
      days: 30,
    });

    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(generations.create).toHaveBeenCalled();
  });
});
