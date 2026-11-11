import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  buildAvatarAss,
  endCardSecondsFor,
  renderAvatarTemplateLayers,
  wordCuesFromLines,
  type DesignedAvatarTemplate,
} from './avatar-template';
import { VideoCompositionService } from './video-composition.service';

async function resolveFfmpeg(): Promise<string | null> {
  try {
    const mod = await import('ffmpeg-static');
    const path = (mod as { default?: string | null }).default;
    return typeof path === 'string' && path ? path : null;
  } catch {
    return null;
  }
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 || args[0] === '-i'
        ? resolve(err)
        : reject(new Error(err.slice(-400))),
    );
  });
}

const COLORS = { dark: '#0E1F31', primary: '#0092CF', accent: '#33B6EC' };

describe('VideoCompositionService.composeAvatarTemplate', () => {
  for (const template of [
    'profesional',
    'circulo',
    'dividido',
  ] as DesignedAvatarTemplate[]) {
    it(`${template}: 720x1280, voz conservada, tarjeta final y ≤ 10 s`, async () => {
      const ffmpeg = await resolveFfmpeg();
      if (!ffmpeg) {
        console.warn('ffmpeg-static no disponible; se omite');
        return;
      }
      const dir = await mkdtemp(join(tmpdir(), 'cm-tpl-test-'));
      try {
        const clip = join(dir, 'avatar.mp4');
        // Clip "lip-sync" cuadrado de 7 s con voz (tono).
        await run(ffmpeg, [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=s=512x512:d=7:r=24',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=7',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          clip,
        ]);
        const logo = await sharp({
          create: { width: 400, height: 160, channels: 4, background: '#FFFFFF' },
        })
          .png()
          .toBuffer();
        const layers = await renderAvatarTemplateLayers({
          template,
          colors: COLORS,
          logo,
          title: 'Soluciones informáticas para tu empresa',
          website: 'aabsolucionesinformaticas.com.mx',
          fontTitle: 'Montserrat',
          fontBody: 'Montserrat',
        });
        const mainSeconds = 7;
        const endCardSeconds = endCardSecondsFor(mainSeconds, 10);
        const ass = buildAvatarAss({
          template,
          colors: COLORS,
          fontTitle: 'Montserrat',
          fontBody: 'Montserrat',
          titleLines: layers.titleLines,
          titleSize: layers.titleSize,
          website: 'aabsolucionesinformaticas.com.mx',
          words: wordCuesFromLines([
            { startSeconds: 0.1, endSeconds: 3.4, text: 'Hola, somos AAB Soluciones.' },
            { startSeconds: 3.5, endSeconds: 6.8, text: 'Escríbenos hoy mismo.' },
          ]),
          mainSeconds,
          endCardSeconds,
        });
        const service = new VideoCompositionService();
        const result = await service.composeAvatarTemplate({
          clipPath: clip,
          layers,
          ass,
          mainSeconds,
          endCardSeconds,
          withMusic: true,
          musicTrackId: 'upbeat-light',
        });
        try {
          expect(result.outPath).toBeTruthy();
          expect(result.width).toBe(720);
          expect(result.height).toBe(1280);
          expect(result.burnedSubtitles).toBe(true);
          expect(result.durationSeconds!).toBeLessThanOrEqual(10);
          expect(result.durationSeconds!).toBeGreaterThan(8);
          const probe = await run(ffmpeg, ['-i', result.outPath!]);
          expect(probe).toMatch(/720x1280/);
          expect(probe).toMatch(/Audio:/);
        } finally {
          await service.cleanupWorkDir(result.workDir);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }, 120000);
  }
});
