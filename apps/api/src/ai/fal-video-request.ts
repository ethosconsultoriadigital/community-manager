/**
 * Modelos fal de video vigentes (Hailuo 02 Standard).
 * video-01 sigue documentado pero es la generación anterior y en producción
 * falla o se queda colgado; si Render aún tiene ese id, se redirige aquí.
 */
export const HAILUO_T2V_MODEL = 'fal-ai/minimax/hailuo-02/standard/text-to-video';
export const HAILUO_I2V_MODEL = 'fal-ai/minimax/hailuo-02/standard/image-to-video';

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
  return { model: raw };
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
  const body: Record<string, unknown> = {
    prompt: text,
    prompt_optimizer: true,
  };
  if (imageUrl?.trim()) body.image_url = imageUrl.trim();

  const id = model.toLowerCase();
  if (id.includes('hailuo') && id.includes('/standard/')) {
    body.duration = '6';
    const resolution = process.env.FAL_VIDEO_RESOLUTION?.trim() || '768P';
    body.resolution = resolution === '512P' ? '512P' : '768P';
  }
  return body;
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
