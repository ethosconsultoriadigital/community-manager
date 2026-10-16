import sharp from 'sharp';
import {
  autoLogoBox,
  logoPosition,
  type BrandTextField,
  type ResolvedBrandLayout,
} from './brand-layout';
import { chooseLogoPlacement, downsampleRgb, type PixelRect } from './logo-placement';

export type ComposeBrandInput = {
  background: Buffer;
  logo: Buffer;
  layout: ResolvedBrandLayout;
  fields: Record<string, string>;
};

export type ComposeBrandResult = {
  buffer: Buffer;
  width: number;
  height: number;
  logoLeft: number;
  logoTop: number;
  logoWidth: number;
  logoHeight: number;
  placement: 'auto' | 'fixed';
};

export async function composeBrandImage(
  input: ComposeBrandInput,
): Promise<ComposeBrandResult> {
  const { width: canvasW, height: canvasH } = input.layout.canvas;
  const box =
    input.layout.logoPlacement === 'fixed'
      ? input.layout.logo
      : autoLogoBox(canvasW, canvasH);

  const [background, logo] = await Promise.all([
    sharp(input.background).resize(canvasW, canvasH, { fit: 'cover' }).png().toBuffer(),
    scaledLogo(input.logo, box.maxWidth, box.maxHeight),
  ]);
  const { buffer: logoBuffer, width: logoW, height: logoH } = logo;
  const analysis = await downsampleRgb(background, canvasW, canvasH);
  const avoid = textAvoidRects(input.layout.text, input.fields);

  let left: number;
  let top: number;
  if (input.layout.logoPlacement === 'fixed') {
    const pos = logoPosition({
      canvasW,
      canvasH,
      logoW,
      logoH,
      anchor: input.layout.logo.anchor,
      margin: box.margin,
    });
    left = pos.left;
    top = pos.top;
  } else {
    const placed = chooseLogoPlacement({
      image: analysis,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      logoWidth: logoW,
      logoHeight: logoH,
      margin: box.margin,
      avoid,
    });
    left = placed.left;
    top = placed.top;
  }

  const maxLeft = Math.max(0, canvasW - logoW);
  const maxTop = Math.max(0, canvasH - logoH);
  left = Math.min(maxLeft, Math.max(0, left));
  top = Math.min(maxTop, Math.max(0, top));

  const composites: sharp.OverlayOptions[] = [{ input: logoBuffer, left, top }];

  const svgText = buildTextSvg(input.layout.canvas, input.layout.text, input.fields);
  if (svgText) composites.push({ input: Buffer.from(svgText), left: 0, top: 0 });

  const buffer = await sharp(background).composite(composites).png().toBuffer();
  return {
    buffer,
    width: canvasW,
    height: canvasH,
    logoLeft: left,
    logoTop: top,
    logoWidth: logoW,
    logoHeight: logoH,
    placement: input.layout.logoPlacement,
  };
}

/**
 * Solo escala hacia abajo, con la misma proporción. Si ya cabe, devuelve el
 * archivo subido sin re-codificar: mismos píxeles, fondo y colores.
 */
async function scaledLogo(
  logo: Buffer,
  maxWidth: number,
  maxHeight: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(logo).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW < 1 || srcH < 1) {
    const resized = await sharp(logo)
      .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: resized.data,
      width: resized.info.width ?? maxWidth,
      height: resized.info.height ?? maxHeight,
    };
  }
  const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
  if (scale >= 0.999) return { buffer: logo, width: srcW, height: srcH };
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const buffer = await sharp(logo)
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
  return { buffer, width, height };
}

export function textAvoidRects(
  textFields: BrandTextField[],
  fields: Record<string, string>,
): PixelRect[] {
  const rects: PixelRect[] = [];
  for (const spec of textFields) {
    const value = fields[spec.field]?.trim();
    if (!value) continue;
    const lines = wrapText(value, spec.maxWidth, spec.size);
    const lineHeight = Math.round(spec.size * 1.2);
    const height =
      spec.size +
      Math.max(0, lines.length - 1) * lineHeight +
      Math.round(spec.size * 0.25);
    rects.push({
      x: spec.x,
      y: Math.max(0, spec.y - spec.size),
      width: spec.maxWidth,
      height,
    });
  }
  return rects;
}

function buildTextSvg(
  canvas: { width: number; height: number },
  textFields: BrandTextField[],
  fields: Record<string, string>,
): string | null {
  const nodes: string[] = [];
  for (const spec of textFields) {
    const value = fields[spec.field]?.trim();
    if (!value) continue;
    const lines = wrapText(value, spec.maxWidth, spec.size);
    const lineHeight = Math.round(spec.size * 1.2);
    const anchor =
      spec.align === 'center' ? 'middle' : spec.align === 'right' ? 'end' : 'start';
    const x =
      spec.align === 'center'
        ? spec.x + Math.round(spec.maxWidth / 2)
        : spec.align === 'right'
          ? spec.x + spec.maxWidth
          : spec.x;
    const weight = spec.font === 'bold' ? '700' : '600';
    lines.forEach((line, i) => {
      const y = spec.y + i * lineHeight;
      nodes.push(
        `<text x="${x}" y="${y}" fill="${escapeXml(spec.color)}" font-size="${spec.size}" ` +
          `font-family="Arial, Helvetica, sans-serif" font-weight="${weight}" ` +
          `text-anchor="${anchor}">${escapeXml(line)}</text>`,
      );
    });
  }
  if (!nodes.length) return null;
  return (
    `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">` +
    nodes.join('') +
    `</svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Aproxima wrapping por ancho de glifo (~0.55em). */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const avgChar = Math.max(fontSize * 0.55, 1);
  const maxChars = Math.max(1, Math.floor(maxWidth / avgChar));
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}
