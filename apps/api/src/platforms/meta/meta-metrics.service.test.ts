import { describe, expect, it, vi } from 'vitest';
import { MetaMetricsService } from './meta-metrics.service';

describe('MetaMetricsService', () => {
  it('delega en Graph API según plataforma', async () => {
    const meta = {
      getFacebookPostMetrics: vi.fn().mockResolvedValue({ likes: 5, comments: 2, engagement: 7 }),
      getInstagramMediaMetrics: vi.fn().mockResolvedValue({ likes: 3, reach: 10, engagement: 3 }),
    };
    const service = new MetaMetricsService(meta as never);

    const fb = await service.fetchPostMetrics({
      platform: 'facebook',
      platformPostId: '123',
      accessToken: 'tok',
      externalAccountId: 'page',
    });
    expect(fb.likes).toBe(5);
    expect(meta.getFacebookPostMetrics).toHaveBeenCalledWith('123', 'tok');

    const ig = await service.fetchPostMetrics({
      platform: 'instagram',
      platformPostId: '456',
      accessToken: 'tok',
      externalAccountId: 'ig',
    });
    expect(ig.reach).toBe(10);
    expect(meta.getInstagramMediaMetrics).toHaveBeenCalledWith('456', 'tok');
  });
});
