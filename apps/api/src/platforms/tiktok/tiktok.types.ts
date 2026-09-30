export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
export const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

/** Scopes TikTok: en la URL van separados por COMA. */
export const TIKTOK_OAUTH_SCOPES = [
  'user.info.basic',
  'video.upload',
  'video.publish',
] as const;

export const TIKTOK_REQUIRED_SCOPES = ['video.upload', 'video.publish'] as const;

export type TikTokConnectionStatus =
  | 'permisos_incompletos'
  | 'requiere_reconexion'
  | null;

export type TikTokOAuthPendingState = {
  userId: string;
  agencyId: string;
  clientId: string;
};

export class TikTokOAuthStateInvalidError extends Error {
  constructor(public readonly redirectUrl: string) {
    super('state inválido o expirado');
    this.name = 'TikTokOAuthStateInvalidError';
  }
}

export type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
};

export type TikTokUserInfo = {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
};
