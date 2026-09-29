export const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
export const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
export const X_API_BASE = 'https://api.x.com/2';
export const X_MEDIA_UPLOAD_URL = 'https://api.x.com/2/media/upload';

/** Límite de caracteres por tweet (API v2, cuentas estándar). */
export const X_TWEET_MAX_LENGTH = 280;

/** Máximo de imágenes por tweet (API X). */
export const X_MAX_IMAGES = 4;

/** Tamaño máximo por imagen para tweet_image (5 MB). */
export const X_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const X_ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Scopes OAuth 2.0 (User context).
 * offline.access es obligatorio para refresh_token.
 * media.write es obligatorio para adjuntar imágenes.
 */
export const X_OAUTH_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
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

export type XOAuthPendingState = {
  userId: string;
  agencyId: string;
  clientId: string;
  codeVerifier: string;
};

export class XOAuthStateInvalidError extends Error {
  constructor(public readonly redirectUrl: string) {
    super('state inválido o expirado');
    this.name = 'XOAuthStateInvalidError';
  }
}

export type XTweetCreateResponse = {
  data?: { id: string; text?: string };
  errors?: Array<{ message?: string; detail?: string; title?: string }>;
};

export type XMediaUploadResponse = {
  data?: { id: string; media_key?: string };
  errors?: Array<{ message?: string; detail?: string; title?: string }>;
};
