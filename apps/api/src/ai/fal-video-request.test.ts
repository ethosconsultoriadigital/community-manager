import { afterEach, describe, expect, it } from 'vitest';
import {
  HAILUO_I2V_MODEL,
  HAILUO_T2V_MODEL,
  LTX_I2V_MODEL,
  LTX_T2V_MODEL,
  SEEDANCE_I2V_MODEL,
  SEEDANCE_T2V_MODEL,
  buildFalVideoBody,
  extractFalVideoUrl,
  resolveFalVideoModel,
} from './fal-video-request';

describe('resolveFalVideoModel', () => {
  afterEach(() => {
    delete process.env.FAL_ALLOW_LEGACY_VIDEO_MODEL;
  });

  it('usa Hailuo 02 standard si no hay override', () => {
    expect(resolveFalVideoModel(undefined, true).model).toBe(HAILUO_I2V_MODEL);
    expect(resolveFalVideoModel(undefined, false).model).toBe(HAILUO_T2V_MODEL);
  });

  it('redirige video-01 (id viejo de Render) a Hailuo', () => {
    const resolved = resolveFalVideoModel(
      'fal-ai/minimax/video-01/image-to-video',
      true,
    );
    expect(resolved.model).toBe(HAILUO_I2V_MODEL);
    expect(resolved.remappedFrom).toContain('video-01');
  });

  it('respeta un modelo custom que no sea video-01', () => {
    expect(
      resolveFalVideoModel('fal-ai/minimax/hailuo-02/pro/image-to-video', true).model,
    ).toBe('fal-ai/minimax/hailuo-02/pro/image-to-video');
  });

  it('acepta el alias seedance y elige i2v o t2v', () => {
    expect(resolveFalVideoModel('seedance', true).model).toBe(SEEDANCE_I2V_MODEL);
    expect(resolveFalVideoModel('seedance', false).model).toBe(SEEDANCE_T2V_MODEL);
    expect(resolveFalVideoModel('ltx', true).model).toBe(LTX_I2V_MODEL);
  });

  it('deja video-01 si FAL_ALLOW_LEGACY_VIDEO_MODEL=true', () => {
    process.env.FAL_ALLOW_LEGACY_VIDEO_MODEL = 'true';
    expect(resolveFalVideoModel('fal-ai/minimax/video-01', false).model).toBe(
      'fal-ai/minimax/video-01',
    );
  });
});

describe('buildFalVideoBody', () => {
  afterEach(() => {
    delete process.env.FAL_VIDEO_RESOLUTION;
  });

  it('manda duration como string y resolution en Hailuo standard', () => {
    expect(
      buildFalVideoBody(HAILUO_I2V_MODEL, 'un latte', 'https://cdn/a.png'),
    ).toEqual({
      prompt: 'un latte',
      prompt_optimizer: true,
      image_url: 'https://cdn/a.png',
      duration: '6',
      resolution: '768P',
    });
  });

  it('acepta 512P para instancias con poca RAM', () => {
    process.env.FAL_VIDEO_RESOLUTION = '512P';
    expect(buildFalVideoBody(HAILUO_T2V_MODEL, 'plano').resolution).toBe('512P');
  });

  it('Seedance va en 9:16, duration texto y sin prompt_optimizer', () => {
    expect(
      buildFalVideoBody(SEEDANCE_I2V_MODEL, 'un latte', 'https://cdn/a.png'),
    ).toEqual({
      prompt: 'un latte',
      aspect_ratio: '9:16',
      resolution: '720p',
      duration: '5',
      image_url: 'https://cdn/a.png',
    });
    const t2v = buildFalVideoBody(SEEDANCE_T2V_MODEL, 'plano');
    expect(t2v.image_url).toBeUndefined();
    expect(t2v.aspect_ratio).toBe('9:16');
    expect(t2v.prompt_optimizer).toBeUndefined();
  });

  it('LTX usa frames y 9:16, no duration de Hailuo', () => {
    expect(buildFalVideoBody(LTX_I2V_MODEL, 'camina', 'https://cdn/a.png')).toEqual({
      prompt: 'camina',
      aspect_ratio: '9:16',
      resolution: '720p',
      num_frames: 121,
      frame_rate: 24,
      image_url: 'https://cdn/a.png',
    });
    expect(buildFalVideoBody(LTX_T2V_MODEL, 'plano').image_url).toBeUndefined();
  });

  it('no añade resolution al endpoint pro', () => {
    const body = buildFalVideoBody(
      'fal-ai/minimax/hailuo-02/pro/image-to-video',
      'plano',
      'https://cdn/a.png',
    );
    expect(body.resolution).toBeUndefined();
    expect(body.duration).toBeUndefined();
    expect(body.image_url).toBe('https://cdn/a.png');
  });
});

describe('extractFalVideoUrl', () => {
  it('lee video.url y el anidado data.video.url de la cola', () => {
    expect(extractFalVideoUrl({ video: { url: 'https://cdn/a.mp4' } })).toBe(
      'https://cdn/a.mp4',
    );
    expect(
      extractFalVideoUrl({ data: { video: { url: 'https://cdn/b.mp4' } } }),
    ).toBe('https://cdn/b.mp4');
  });
});
