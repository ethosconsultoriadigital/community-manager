export type UserRole = 'owner' | 'admin' | 'manager' | 'viewer';

export type SafeUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  agencyId: string;
};

export type AuthResponse = {
  accessToken: string;
  user: SafeUser;
  agency: { id: string; name: string };
};

export type Client = {
  id: string;
  name: string;
  is_active: boolean;
};

export type SocialAccount = {
  id: string;
  client_id: string;
  platform: string;
  username: string | null;
  external_account_id: string;
  is_active?: boolean;
};

export type PostTarget = {
  id: string;
  status: string;
  error_message?: string | null;
  platform_post_id?: string | null;
  social_accounts: SocialAccount;
};

export type Post = {
  id: string;
  client_id: string;
  status: string;
  caption: string | null;
  hashtags: string[];
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  content_source_id: string | null;
  video_format?: 'feed' | 'reel' | null;
  post_targets: PostTarget[];
  media_assets?: MediaAsset[];
};

export type MediaAsset = {
  id: string;
  post_id: string | null;
  type: 'image' | 'video';
  source: string;
  storage_url: string;
  position: number;
};

export type AnalyticsSummary = {
  publishedTargets: number;
  withMetrics: number;
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagement: number;
  };
  topPosts: Array<{
    postId: string;
    caption: string | null;
    clientId: string;
    engagement: number;
    impressions: number;
    likes: number;
  }>;
};

export type PostInsight = {
  id: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagement: number | null;
  fetched_at: string;
  post_targets: {
    id: string;
    platform_post_id: string | null;
    social_accounts: { platform: string; username: string | null };
  };
};

export type CanvaStatus = {
  configured: boolean;
  connected: boolean;
};

export type GenerateFromBriefResult = {
  post: Post;
  media: MediaAsset[];
  usedMock?: boolean;
  imageProvider?: 'openai' | 'mock' | 'unknown';
  imageModel?: string | null;
};

export type AdminUserClient = {
  id: string;
  name: string;
  isActive: boolean;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  client: AdminUserClient | null;
};

export type ContentSource = {
  id: string;
  client_id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  min_score: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SourceItem = {
  id: string;
  external_id: string;
  title: string | null;
  sentiment: string | null;
  sentiment_score: number | string | null;
  flagged_publish: boolean;
  status: string;
  post_id: string | null;
  image_url: string | null;
  source_url: string | null;
  created_at: string;
};

export type RadarSyncResult = {
  ingest: {
    ingested: number;
    duplicates: number;
    belowMinScore: number;
    notFlagged: number;
    skippedNoRadarmexUrl?: number;
    skippedOutOfDateRange?: number;
    dateFrom?: string;
    dateTo?: string;
  };
  promote: {
    itemsConsidered: number;
    postsCreated: number;
    skippedNoAccount: number;
    skippedNoCopy: number;
    errors: string[];
  };
};

export type GoogleSheetStatus = {
  configured: boolean;
  clientEmail: string | null;
};
