export const THREADS_API_VERSION = 'v1.0';

export const THREADS_OAUTH_SCOPES = [
  'threads_basic',
  'threads_content_publish',
] as const;

export type ThreadsTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number | string;
};

export type ThreadsProfile = {
  id: string;
  username?: string;
};

export type ThreadsOAuthState = {
  sub: string;
  agencyId: string;
  clientId: string;
  nonce: string;
};
