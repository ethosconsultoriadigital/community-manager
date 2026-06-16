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
};

export type PostTarget = {
  id: string;
  status: string;
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
  post_targets: PostTarget[];
};
