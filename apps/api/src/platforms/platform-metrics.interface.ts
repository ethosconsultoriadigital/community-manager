export type PostMetricsSnapshot = {
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  engagement?: number | null;
};

export type FetchPostMetricsInput = {
  platform: 'facebook' | 'instagram';
  platformPostId: string;
  accessToken: string;
  externalAccountId: string;
};

export interface PlatformMetricsProvider {
  fetchPostMetrics(input: FetchPostMetricsInput): Promise<PostMetricsSnapshot>;
}
