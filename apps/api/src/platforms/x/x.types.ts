export const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
export const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
export const X_API_BASE = 'https://api.twitter.com/2';

/** Límite de caracteres por tweet (API v2, cuentas estándar). */
export const X_TWEET_MAX_LENGTH = 280;

/**
 * Scopes OAuth 2.0 (User context).
 * offline.access es obligatorio para refresh_token.
 */
export const X_OAUTH_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
] as const;

export type XTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type XProfile = {
  id: string;
  username?: string;
  name?: string;
};

export type XOAuthState = {
  sub: string;
  agencyId: string;
  clientId: string;
  codeVerifier: string;
  nonce: string;
};

export type XTweetCreateResponse = {
  data?: { id: string; text?: string };
  errors?: Array<{ message?: string; detail?: string; title?: string }>;
};
