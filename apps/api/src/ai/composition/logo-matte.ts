import sharp from 'sharp';

/**
 * Quita un fondo casi uniforme conectado al borde (PNG opaco, JPEG o color
 * sólido). No es un color-key global: un blanco encerrado (estrella, contraforma)
 * se conserva. Un logo ya transparente o una imagen de un solo color no se toca.
 */

const ALREADY_TRANSPARENT_RATIO = 0.12;
const OPAQUE_BORDER_RATIO = 0.5;
const BORDER_OUTLIER_RATIO = 0.12;
const BORDER_OUTLIER_DELTA = 28;
const MIN_FOREGROUND_RATIO = 0.012;
const FOREGROUND_DELTA = 40;
const FLOOD_DELTA = 32;
const FRINGE_DELTA = 48;
const FRINGE_PASSES = 2;
const MAX_KNOCKOUT_RATIO = 0.97;

export type MatteResult = {
  buffer: Buffer;
  width: number;
  height: number;
  knockedOut: boolean;
};

type Rgb = { r: number; g: number; b: number };

export async function knockoutUniformBackground(input: Buffer): Promise<MatteResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < 2 || height < 2) {
    return png(Buffer.from(data), width, height, false);
  }

  const pixels = Buffer.from(data);
  const count = width * height;
  let transparent = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3]! < 16) transparent++;
  }
  if (transparent / count >= ALREADY_TRANSPARENT_RATIO) {
    return png(pixels, width, height, false);
  }

  const border = borderIndices(width, height);
  const bg = medianColor(pixels, border);
  let opaqueBorder = 0;
  let outliers = 0;
  for (const i of border) {
    if (pixels[i * 4 + 3]! < 16) continue;
    opaqueBorder++;
    if (maxDelta(pixels, i, bg) > BORDER_OUTLIER_DELTA) outliers++;
  }
  if (
    opaqueBorder / border.length < OPAQUE_BORDER_RATIO ||
    outliers / Math.max(opaqueBorder, 1) > BORDER_OUTLIER_RATIO
  ) {
    return png(pixels, width, height, false);
  }

  let foreground = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3]! < 16) continue;
    if (maxDelta(pixels, i, bg) > FOREGROUND_DELTA) foreground++;
  }
  if (foreground / count < MIN_FOREGROUND_RATIO) {
    return png(pixels, width, height, false);
  }

  const knock = new Uint8Array(count);
  const queue: number[] = [];
  for (const i of border) {
    if (pixels[i * 4 + 3]! < 16 || maxDelta(pixels, i, bg) <= FLOOD_DELTA) {
      knock[i] = 1;
      queue.push(i);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const i = queue[head]!;
    head++;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nb = ny * width + nx;
        if (knock[nb]) continue;
        if (pixels[nb * 4 + 3]! < 16 || maxDelta(pixels, nb, bg) <= FLOOD_DELTA) {
          knock[nb] = 1;
          queue.push(nb);
        }
      }
    }
  }

  const opaque = count - transparent;
  if (opaque <= 0 || knockedCount(knock, pixels, count) / opaque > MAX_KNOCKOUT_RATIO) {
    return png(pixels, width, height, false);
  }

  for (let pass = 0; pass < FRINGE_PASSES; pass++) {
    const extra: number[] = [];
    for (let i = 0; i < count; i++) {
      if (knock[i] || pixels[i * 4 + 3]! < 16) continue;
      if (maxDelta(pixels, i, bg) > FRINGE_DELTA) continue;
      const x = i % width;
      const y = (i - x) / width;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (knock[ny * width + nx]) {
            touches = true;
            break;
          }
        }
      }
      if (touches) extra.push(i);
    }
    if (!extra.length) break;
    for (const i of extra) knock[i] = 1;
  }

  if (knockedCount(knock, pixels, count) / opaque > MAX_KNOCKOUT_RATIO) {
    return png(pixels, width, height, false);
  }

  for (let i = 0; i < count; i++) {
    if (knock[i]) pixels[i * 4 + 3] = 0;
  }
  return png(pixels, width, height, true);
}

/**
 * Luminancia del trazo sólido junto al borde transparente.
 * Ignora el fleco antialias y el blanco encerrado (contraforma).
 */
export function edgeOpaqueLuminance(
  rgba: Uint8Array,
  width: number,
  height: number,
): number {
  const edge: number[] = [];
  const all: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const alpha = rgba[o + 3]!;
      if (alpha < 32) continue;
      const L = relativeLuminance(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!);
      if (alpha >= 250) all.push(L);
      if (alpha < 250) continue;
      let nearClear = false;
      for (let dy = -3; dy <= 3 && !nearClear; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            nearClear = true;
            break;
          }
          if (rgba[(ny * width + nx) * 4 + 3]! < 16) {
            nearClear = true;
            break;
          }
        }
      }
      if (nearClear) edge.push(L);
    }
  }
  const source = edge.length >= 8 ? edge : all;
  if (!source.length) return 0.5;
  source.sort((a, b) => a - b);
  return source[Math.floor(source.length / 2)]!;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function knockedCount(knock: Uint8Array, pixels: Buffer, count: number): number {
  let knocked = 0;
  for (let i = 0; i < count; i++) {
    if (knock[i] && pixels[i * 4 + 3]! >= 16) knocked++;
  }
  return knocked;
}

function maxDelta(pixels: Buffer, index: number, bg: Rgb): number {
  const o = index * 4;
  return Math.max(
    Math.abs(pixels[o]! - bg.r),
    Math.abs(pixels[o + 1]! - bg.g),
    Math.abs(pixels[o + 2]! - bg.b),
  );
}

function borderIndices(width: number, height: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < width; x++) {
    out.push(x);
    if (height > 1) out.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    out.push(y * width);
    if (width > 1) out.push(y * width + width - 1);
  }
  return out;
}

function medianColor(pixels: Buffer, indices: number[]): Rgb {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const i of indices) {
    const o = i * 4;
    if (pixels[o + 3]! < 16) continue;
    rs.push(pixels[o]!);
    gs.push(pixels[o + 1]!);
    bs.push(pixels[o + 2]!);
  }
  if (!rs.length) return { r: 255, g: 255, b: 255 };
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function png(
  pixels: Buffer,
  width: number,
  height: number,
  knockedOut: boolean,
): Promise<MatteResult> {
  const buffer = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { buffer, width, height, knockedOut };
}
