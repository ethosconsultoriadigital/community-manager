/**
 * Modelos fal de video vigentes (Hailuo 02 Standard).
 * video-01 sigue documentado pero es la generación anterior y en producción
 * falla o se queda colgado; si Render aún tiene ese id, se redirige aquí.
 */
export const HAILUO_T2V_MODEL = 'fal-ai/minimax/hailuo-02/standard/text-to-video';
export const HAILUO_I2V_MODEL = 'fal-ai/minimax/hailuo-02/standard/image-to-video';

/** Opt-in más baratos. No son el default: hay que ponerlos en FAL_*_MODEL. */
export const SEEDANCE_T2V_MODEL = 'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video';
export const SEEDANCE_I2V_MODEL = 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video';
export const LTX_T2V_MODEL = 'fal-ai/ltxv-13b-098-distilled';
export const LTX_I2V_MODEL = 'fal-ai/ltxv-13b-098-distilled/image-to-video';

const LEGACY_VIDEO_01 = /video-01/i;

export function resolveFalVideoModel(
  configured: string | undefined,
  hasImage: boolean,
): { model: string; remappedFrom?: string } {
  const fallback = hasImage ? HAILUO_I2V_MODEL : HAILUO_T2V_MODEL;
  const raw = configured?.trim();
  if (!raw) return { model: fallback };
  if (process.env.FAL_ALLOW_LEGACY_VIDEO_MODEL === 'true') {
    return { model: raw };
  }
  if (LEGACY_VIDEO_01.test(raw)) {
    return { model: fallback, remappedFrom: raw };
  }
  const alias = expandVideoAlias(raw, hasImage);
  if (alias) return { model: alias, remappedFrom: raw === alias ? undefined : raw };
  const paired = pairVideoEndpoint(raw, hasImage);
  if (paired !== raw) return { model: paired, remappedFrom: raw };
  return { model: raw };
}

function expandVideoAlias(raw: string, hasImage: boolean): string | null {
  const id = raw.trim().toLowerCase();
  if (id === 'seedance' || id === 'seedance-fast') {
    return hasImage ? SEEDANCE_I2V_MODEL : SEEDANCE_T2V_MODEL;
  }
  if (id === 'ltx' || id === 'ltxv') {
    return hasImage ? LTX_I2V_MODEL : LTX_T2V_MODEL;
  }
  return null;
}

/** Si pegan el id de image-to-video en el env de texto (o al revés), usa el par correcto. */
function pairVideoEndpoint(model: string, hasImage: boolean): string {
  if (model === SEEDANCE_I2V_MODEL && !hasImage) return SEEDANCE_T2V_MODEL;
  if (model === SEEDANCE_T2V_MODEL && hasImage) return SEEDANCE_I2V_MODEL;
  if (model === LTX_I2V_MODEL && !hasImage) return LTX_T2V_MODEL;
  if (model === LTX_T2V_MODEL && hasImage) return LTX_I2V_MODEL;
  return model;
}

/**
 * Hailuo 02 Standard exige `duration` como string ("6"|"10") y `resolution`
 * ("768P"|"512P"). Un número o un id de video-01 responde 422.
 */
export function buildFalVideoBody(
  model: string,
  prompt: string,
  imageUrl?: string,
): Record<string, unknown> {
  const text = prompt.trim().slice(0, 2000);
  const image = imageUrl?.trim();
  const id = model.toLowerCase();

  if (id.includes('seedance')) {
    const body: Record<string, unknown> = {
      prompt: text,
      aspect_ratio: '9:16',
      resolution: seedanceResolution(),
      duration: '5',
    };
    if (image) body.image_url = image;
    return body;
  }

  if (id.includes('ltxv')) {
    const body: Record<string, unknown> = {
      prompt: text,
      aspect_ratio: '9:16',
      resolution: ltxResolution(),
      num_frames: 121,
      frame_rate: 24,
    };
    if (image) body.image_url = image;
    return body;
  }

  const body: Record<string, unknown> = {
    prompt: text,
    prompt_optimizer: true,
  };
  if (image) body.image_url = image;

  if (id.includes('hailuo') && id.includes('/standard/')) {
    body.duration = '6';
    const resolution = process.env.FAL_VIDEO_RESOLUTION?.trim() || '768P';
    body.resolution = resolution === '512P' ? '512P' : '768P';
  }
  return body;
}

/** Seedance: 480p | 720p | 1080p, en minúsculas. 720p equilibra coste y el 9:16 final. */
function seedanceResolution(): '480p' | '720p' | '1080p' {
  const raw = (process.env.FAL_VIDEO_RESOLUTION ?? '').trim().toLowerCase();
  if (raw === '512p' || raw === '480p') return '480p';
  if (raw === '1080p') return '1080p';
  return '720p';
}

/** LTX distilled solo admite 480p y 720p. */
function ltxResolution(): '480p' | '720p' {
  const raw = (process.env.FAL_VIDEO_RESOLUTION ?? '').trim().toLowerCase();
  if (raw === '512p' || raw === '480p') return '480p';
  return '720p';
}

export function extractFalVideoUrl(result: Record<string, unknown>): string | null {
  const fromVideo = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null;
    const url = (node as { url?: unknown }).url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  };

  const direct = fromVideo(result.video);
  if (direct) return direct;
  if (typeof result.video_url === 'string' && result.video_url.trim()) {
    return result.video_url.trim();
  }

  const data = result.data;
  if (data && typeof data === 'object') {
    const nested = fromVideo((data as { video?: unknown }).video);
    if (nested) return nested;
    const nestedUrl = (data as { video_url?: unknown }).video_url;
    if (typeof nestedUrl === 'string' && nestedUrl.trim()) return nestedUrl.trim();
  }
  return null;
}
