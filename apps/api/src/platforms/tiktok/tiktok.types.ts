export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
export const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
export const TIKTOK_CREATOR_INFO_URL =
  'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
export const TIKTOK_VIDEO_INIT_URL =
  'https://open.tiktokapis.com/v2/post/publish/video/init/';
export const TIKTOK_STATUS_FETCH_URL =
  'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

/** Privacidad única mientras la app no pase la auditoría de Content Posting. */
export const TIKTOK_PRIVACY_SELF_ONLY = 'SELF_ONLY';

/** Título de Direct Post (caption). TikTok rechaza por encima de este tope. */
export const TIKTOK_TITLE_MAX = 2200;

/**
 * Fragmento objetivo, en bytes decimales como el ejemplo de la guía de TikTok
 * (50_000_123 → 5 fragmentos de 10_000_000). Cabe entre 5 MB y 64 MB.
 * Un video más pequeño se sube entero en un solo PUT.
 */
export const TIKTOK_TARGET_CHUNK_BYTES = 10_000_000;

/** Espera del procesado de TikTok dentro del job de publicación. */
export const TIKTOK_STATUS_POLL_MS = 3_000;
export const TIKTOK_STATUS_MAX_WAIT_MS = 10 * 60 * 1000;

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

export type TikTokCreatorInfo = {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

export type TikTokFileUploadPlan = {
  chunkSize: number;
  totalChunkCount: number;
};

export type TikTokInitVideoResult = {
  publish_id: string;
  upload_url: string;
};

export type TikTokPublishStatus = {
  status?: string;
  fail_reason?: string;
  /** Grafía que devuelve la API hoy. */
  publicaly_available_post_id?: Array<string | number>;
  publicly_available_post_id?: Array<string | number>;
};
