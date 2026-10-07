import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
    );
  });
}

describe('VideoCompositionService', () => {
  it('une 2 clips de prueba y exporta 9:16 (1080x1920)', async () => {
    const ffmpeg = await resolveFfmpeg();
    if (!ffmpeg) {
      console.warn('ffmpeg-static no disponible; se omite test de composición');
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'cm-comp-test-'));
    try {
      const a = join(dir, 'a.mp4');
      const b = join(dir, 'b.mp4');
      await run(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=640x360:d=0.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        a,
      ]);
      await run(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=320x640:d=0.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        b,
      ]);

      const clipA = await readFile(a);
      const clipB = await readFile(b);
      const service = new VideoCompositionService();
      const result = await service.concatClips({
        clips: [clipA, clipB],
        subtitles: [
          { startSeconds: 0, endSeconds: 0.45, text: 'Hola' },
          { startSeconds: 0.5, endSeconds: 0.95, text: 'Mundo' },
        ],
        burnSubtitles: true,
        withMusic: true,
        musicTrackId: 'upbeat-light',
      });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
      expect(result.buffer.length).toBeGreaterThan(1000);
      expect(result.musicTrackId).toBe('upbeat-light');

      const probePath = join(dir, 'out.mp4');
      await writeFile(probePath, result.buffer);
      const probe = await new Promise<string>((resolve, reject) => {
        const child = spawn(ffmpeg, ['-i', probePath], { windowsHide: true });
        let err = '';
        child.stderr.on('data', (c: Buffer) => {
          err += c.toString();
        });
        child.on('error', reject);
        child.on('close', () => resolve(err));
      });
      expect(probe).toMatch(/1080x1920/);
      expect(probe).toMatch(/Audio:/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 90000);

  it('buildSrt formatea cues', () => {
    const service = new VideoCompositionService();
    const srt = service.buildSrt([
      { startSeconds: 0, endSeconds: 1.5, text: 'Promo' },
    ]);
    expect(srt).toContain('00:00:00,000 --> 00:00:01,500');
    expect(srt).toContain('Promo');
  });
});
