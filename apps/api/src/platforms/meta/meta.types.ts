export const META_GRAPH_VERSION = 'v21.0';

export const META_OAUTH_SCOPES = [
  'business_management',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'instagram_basic',
  'instagram_content_publish',
] as const;

export type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type MetaPageAccount = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

export type MetaOAuthState = {
  sub: string;
  agencyId: string;
  clientId: string;
  nonce: string;
};
