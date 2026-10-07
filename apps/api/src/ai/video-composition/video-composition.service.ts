import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getMusicTrack,
  resolveMusicTrackId,
  type LicensedMusicTrack,
} from './licensed-music';

const OUT_W = 1080;
const OUT_H = 1920;

export type SubtitleCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type ConcatClipsInput = {
  clips: Buffer[];
  /** Cues de subtítulo (se queman en el video). */
  subtitles?: SubtitleCue[];
  burnSubtitles?: boolean;
  /** id de pista del catálogo licenciado, o suggestion textual. */
  musicTrackId?: string;
  musicSuggestion?: string;
  withMusic?: boolean;
  musicVolume?: number;
};

export type ConcatClipsResult = {
  buffer: Buffer;
  width: number;
  height: number;
  durationSeconds?: number;
  musicTrackId?: string;
  burnedSubtitles: boolean;
};

/**
 * Une clips, normaliza 9:16, quema subtítulos y añade cama musical propia.
 */
@Injectable()
export class VideoCompositionService {
  private readonly logger = new Logger(VideoCompositionService.name);

  async concatClips(input: ConcatClipsInput): Promise<ConcatClipsResult> {
    if (!input.clips?.length) {
      throw new BadRequestException('Se necesita al menos un clip para componer el Reel');
    }

    const ffmpeg = await this.resolveFfmpegPath();
    const workDir = await mkdtemp(join(tmpdir(), 'cm-reel-'));
    const burnSubtitles = input.burnSubtitles !== false && Boolean(input.subtitles?.length);
    const withMusic = input.withMusic !== false;

    try {
      const inputs: string[] = [];
      for (let i = 0; i < input.clips.length; i++) {
        const path = join(workDir, `clip-${i}.mp4`);
        await writeFile(path, input.clips[i]);
        inputs.push(path);
      }

      const silentPath = join(workDir, 'silent.mp4');
      await this.concatVideoOnly(ffmpeg, inputs, silentPath);

      let videoPath = silentPath;
      let burned = burnSubtitles;
      if (burnSubtitles && input.subtitles?.length) {
        const srtPath = join(workDir, 'subs.srt');
        await writeFile(srtPath, this.buildSrt(input.subtitles), 'utf8');
        const subtitledPath = join(workDir, 'subtitled.mp4');
        try {
          await this.burnSubtitles(ffmpeg, silentPath, srtPath, subtitledPath);
          videoPath = subtitledPath;
        } catch (err) {
          burned = false;
          this.logger.warn(
            `No se pudieron quemar subtítulos; se continúa sin ellos: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }

      const duration = await this.probeDurationSeconds(ffmpeg, videoPath);
      let musicTrackId: string | undefined;
      const outPath = join(workDir, 'out.mp4');

      if (withMusic) {
        musicTrackId = resolveMusicTrackId(input.musicSuggestion, input.musicTrackId);
        const track = getMusicTrack(musicTrackId);
        const musicPath = join(workDir, 'bed.m4a');
        await this.generateMusicBed(
          ffmpeg,
          track,
          Math.max(duration + 0.5, 2),
          musicPath,
        );
        const volume = input.musicVolume ?? 0.22;
        await this.muxMusic(ffmpeg, videoPath, musicPath, volume, duration, outPath);
      } else {
        await this.copyVideo(ffmpeg, videoPath, outPath);
      }

      const buffer = await readFile(outPath);
      this.logger.debug(
        `Reel composed: ${inputs.length} clip(s) → ${OUT_W}x${OUT_H}` +
          ` subs=${burned} music=${musicTrackId ?? 'none'} (${buffer.length} bytes)`,
      );
      return {
        buffer,
        width: OUT_W,
        height: OUT_H,
        durationSeconds: duration,
        musicTrackId,
        burnedSubtitles: burned,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async downloadClip(url: string): Promise<Buffer> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CommunityManager/1.0' },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new BadRequestException(
        `No se pudo descargar clip de video (${response.status})`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async probeClipDuration(buffer: Buffer): Promise<number> {
    const ffmpeg = await this.resolveFfmpegPath();
    const workDir = await mkdtemp(join(tmpdir(), 'cm-probe-'));
    try {
      const path = join(workDir, 'clip.mp4');
      await writeFile(path, buffer);
      return this.probeDurationSeconds(ffmpeg, path);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  buildSrt(cues: SubtitleCue[]): string {
    return cues
      .filter((c) => c.text.trim() && c.endSeconds > c.startSeconds)
      .map((c, i) => {
        const text = c.text.trim().slice(0, 80);
        return `${i + 1}\n${formatSrtTime(c.startSeconds)} --> ${formatSrtTime(c.endSeconds)}\n${text}\n`;
      })
      .join('\n');
  }

  private async concatVideoOnly(
    ffmpeg: string,
    inputs: string[],
    outPath: string,
  ): Promise<void> {
    if (inputs.length === 1) {
      await this.runFfmpeg(ffmpeg, [
        '-y',
        '-i',
        inputs[0],
        '-vf',
        this.scalePadFilter(),
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outPath,
      ]);
      return;
    }
    const filter = this.buildConcatFilter(inputs.length);
    const args = ['-y'];
    for (const p of inputs) args.push('-i', p);
    args.push(
      '-filter_complex',
      filter,
      '-map',
      '[outv]',
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    );
    await this.runFfmpeg(ffmpeg, args);
  }

  private async burnSubtitles(
    ffmpeg: string,
    videoPath: string,
    srtPath: string,
    outPath: string,
  ): Promise<void> {
    // Ruta compatible con filtro subtitles en Windows (/, escape :)
    const escaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const style =
      "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=2,Shadow=0,MarginV=80,Alignment=2";
    await this.runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      videoPath,
      '-vf',
      `subtitles='${escaped}':force_style='${style}'`,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    ]);
  }

  private async generateMusicBed(
    ffmpeg: string,
    track: LicensedMusicTrack,
    durationSeconds: number,
    outPath: string,
  ): Promise<void> {
    const d = Math.max(2, Math.ceil(durationSeconds));
    const freqs = musicFrequencies(track.generator);
    const args: string[] = ['-y'];
    for (const freq of freqs) {
      args.push('-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${d}`);
    }
    const labels = freqs.map((_, i) => `[${i}:a]`).join('');
    args.push(
      '-filter_complex',
      `${labels}amix=inputs=${freqs.length}:duration=longest,volume=0.35,alimiter=limit=0.4[a]`,
      '-map',
      '[a]',
      '-t',
      String(d),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outPath,
    );
    await this.runFfmpeg(ffmpeg, args);
  }

  private async muxMusic(
    ffmpeg: string,
    videoPath: string,
    musicPath: string,
    volume: number,
    duration: number,
    outPath: string,
  ): Promise<void> {
    const vol = Math.min(1, Math.max(0.05, volume));
    const fadeStart = Math.max(0, duration - 1.2);
    await this.runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      videoPath,
      '-i',
      musicPath,
      '-filter_complex',
      `[1:a]volume=${vol},afade=t=out:st=${fadeStart.toFixed(2)}:d=1.2[a]`,
      '-map',
      '0:v:0',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-movflags',
      '+faststart',
      outPath,
    ]);
  }

  private async copyVideo(
    ffmpeg: string,
    videoPath: string,
    outPath: string,
  ): Promise<void> {
    await this.runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      videoPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outPath,
    ]);
  }

  private async probeDurationSeconds(ffmpeg: string, path: string): Promise<number> {
    const stderr = await this.runFfmpegCapture(ffmpeg, ['-i', path]);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return 5;
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    const total = h * 3600 + m * 60 + s;
    return Number.isFinite(total) && total > 0 ? total : 5;
  }

  private scalePadFilter(): string {
    return `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
  }

  private buildConcatFilter(n: number): string {
    const parts: string[] = [];
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      parts.push(`[${i}:v]${this.scalePadFilter()}[v${i}]`);
      labels.push(`[v${i}]`);
    }
    parts.push(`${labels.join('')}concat=n=${n}:v=1:a=0[outv]`);
    return parts.join(';');
  }

  private async resolveFfmpegPath(): Promise<string> {
    try {
      const mod = await import('ffmpeg-static');
      const path = (mod as { default?: string | null }).default ?? (mod as unknown as string);
      if (typeof path === 'string' && path.length > 0) return path;
    } catch {
      /* fall through */
    }
    throw new BadRequestException(
      'ffmpeg no disponible (ffmpeg-static). Revisa la instalación en el servidor.',
    );
  }

  private runFfmpeg(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else {
          this.logger.warn(`ffmpeg exit ${code}: ${stderr.slice(-1200)}`);
          reject(
            new BadRequestException(
              `ffmpeg falló al componer el Reel (código ${code})`,
            ),
          );
        }
      });
    });
  }

  private runFfmpegCapture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', () => resolve(stderr));
    });
  }
}

function formatSrtTime(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

function musicFrequencies(
  generator: LicensedMusicTrack['generator'],
): number[] {
  switch (generator) {
    case 'calm-pad':
      return [196, 247, 294];
    case 'bright-pop':
      return [262, 330, 392, 523];
    case 'soft-upbeat':
    default:
      return [220, 277, 330];
  }
}
