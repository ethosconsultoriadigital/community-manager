import { Injectable } from '@nestjs/common';
import type {
  FetchPostMetricsInput,
  PlatformMetricsProvider,
  PostMetricsSnapshot,
} from '../platform-metrics.interface';
import { MetaGraphClient } from './meta-graph.client';

@Injectable()
export class MetaMetricsService implements PlatformMetricsProvider {
  constructor(private readonly meta: MetaGraphClient) {}

  async fetchPostMetrics(input: FetchPostMetricsInput): Promise<PostMetricsSnapshot> {
    if (input.platform === 'facebook') {
      return this.meta.getFacebookPostMetrics(input.platformPostId, input.accessToken);
    }
    return this.meta.getInstagramMediaMetrics(input.platformPostId, input.accessToken);
  }
}
