export const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
export const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';

export const CANVA_OAUTH_SCOPES = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'asset:read',
  'asset:write',
] as const;

export type CanvaOAuthState = {
  sub: string;
  agencyId: string;
  codeVerifier: string;
  nonce: string;
};

export type CanvaBrandConfig = {
  brandTemplateId?: string;
  textField?: string;
  imageField?: string;
};

export type BrandTemplateField = {
  type: string;
};

export type CanvaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export type CanvaJobStatus = 'failed' | 'in_progress' | 'success';

export type CanvaAssetUploadJob = {
  id: string;
  status: CanvaJobStatus;
  asset?: { id: string };
  error?: { code?: string; message?: string };
};

export type CanvaAutofillJob = {
  id: string;
  status: CanvaJobStatus;
  result?: {
    design?: {
      id?: string;
      url?: string;
    };
  };
  error?: { code?: string; message?: string };
};

export type CanvaExportJob = {
  id: string;
  status: CanvaJobStatus;
  urls?: string[];
  error?: { code?: string; message?: string };
};

export type CanvaDesign = {
  id: string;
  title?: string;
  urls?: {
    edit_url?: string;
    view_url?: string;
  };
};

export type CanvaDesignList = {
  items: CanvaDesign[];
  continuation?: string;
};

export type CanvaReturnJwtPayload = {
  aud: string;
  exp: number;
  sub: string;
  team_id?: string;
  type: string;
  design_id: string;
  correlation_state?: string;
};

export function parseCanvaDesignId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed.includes('/')) return trimmed;
  const match = trimmed.match(/\/design\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function readCanvaBrandConfig(brand: unknown): CanvaBrandConfig {
  if (!brand || typeof brand !== 'object') return {};
  const canva = (brand as { canva?: unknown }).canva;
  if (!canva || typeof canva !== 'object') return {};
  const cfg = canva as Record<string, unknown>;
  return {
    brandTemplateId:
      typeof cfg.brandTemplateId === 'string' ? cfg.brandTemplateId : undefined,
    textField: typeof cfg.textField === 'string' ? cfg.textField : undefined,
    imageField: typeof cfg.imageField === 'string' ? cfg.imageField : undefined,
  };
}
