import sharp from 'sharp';
import {
  autoLogoBox,
  logoPosition,
  type BrandTextField,
  type ResolvedBrandLayout,
} from './brand-layout';
import { edgeOpaqueLuminance, knockoutUniformBackground } from './logo-matte';
import {
  chooseLogoPlacement,
  contrastAt,
  downsampleRgb,
  type PixelRect,
} from './logo-placement';

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
  needsBackdrop: boolean;
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

  const [background, resizedLogo] = await Promise.all([
    sharp(input.background).resize(canvasW, canvasH, { fit: 'cover' }).png().toBuffer(),
    sharp(input.logo)
      .resize(box.maxWidth, box.maxHeight, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer(),
  ]);

  const matted = await knockoutUniformBackground(resizedLogo);
  const logoRaw = await sharp(matted.buffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const logoW = logoRaw.info.width ?? matted.width;
  const logoH = logoRaw.info.height ?? matted.height;
  const logoLuminance = edgeOpaqueLuminance(logoRaw.data, logoW, logoH);
  const analysis = await downsampleRgb(background, canvasW, canvasH);
  const avoid = textAvoidRects(input.layout.text, input.fields);

  let left: number;
  let top: number;
  let needsBackdrop: boolean;
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
    needsBackdrop = contrastAt({
      image: analysis,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      rect: { x: left, y: top, width: logoW, height: logoH },
      logoLuminance,
    }).needsBackdrop;
  } else {
    const placed = chooseLogoPlacement({
      image: analysis,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      logoWidth: logoW,
      logoHeight: logoH,
      logoLuminance,
      margin: box.margin,
      avoid,
    });
    left = placed.left;
    top = placed.top;
    needsBackdrop = placed.needsBackdrop;
  }

  const maxLeft = Math.max(0, canvasW - logoW);
  const maxTop = Math.max(0, canvasH - logoH);
  left = Math.min(maxLeft, Math.max(0, left));
  top = Math.min(maxTop, Math.max(0, top));

  const composites: sharp.OverlayOptions[] = [];
  if (needsBackdrop) {
    const pad = 16;
    const halo = await logoHalo(matted.buffer, logoW, logoH, pad, logoLuminance < 0.5);
    const layer = await croppedOverlay(
      halo,
      logoW + pad * 2,
      logoH + pad * 2,
      left - pad,
      top - pad,
      canvasW,
      canvasH,
    );
    if (layer) composites.push(layer);
  }
  composites.push({ input: matted.buffer, left, top });

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
    needsBackdrop,
    placement: input.layout.logoPlacement,
  };
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

/** Halo que sigue el alfa del logo, no un rectángulo blanco. */
async function logoHalo(
  logoPng: Buffer,
  logoW: number,
  logoH: number,
  pad: number,
  lightPlate: boolean,
): Promise<Buffer> {
  const padded = await sharp(logoPng)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = padded.info.width ?? logoW + pad * 2;
  const height = padded.info.height ?? logoH + pad * 2;
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = padded.data[i * 4 + 3]!;
  const blurred = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(7)
    .raw()
    .toBuffer();
  const color = lightPlate ? [255, 255, 255] : [8, 10, 16];
  const gain = lightPlate ? 1.35 : 1.55;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = Math.min(255, Math.round((blurred[i] ?? 0) * gain));
    rgba[i * 4] = color[0]!;
    rgba[i * 4 + 1] = color[1]!;
    rgba[i * 4 + 2] = color[2]!;
    rgba[i * 4 + 3] = a;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function croppedOverlay(
  input: Buffer,
  layerW: number,
  layerH: number,
  left: number,
  top: number,
  canvasW: number,
  canvasH: number,
): Promise<sharp.OverlayOptions | null> {
  let cropLeft = 0;
  let cropTop = 0;
  let cropW = layerW;
  let cropH = layerH;
  let destLeft = left;
  let destTop = top;
  if (destLeft < 0) {
    cropLeft = -destLeft;
    cropW -= cropLeft;
    destLeft = 0;
  }
  if (destTop < 0) {
    cropTop = -destTop;
    cropH -= cropTop;
    destTop = 0;
  }
  if (destLeft + cropW > canvasW) cropW = canvasW - destLeft;
  if (destTop + cropH > canvasH) cropH = canvasH - destTop;
  if (cropW < 1 || cropH < 1) return null;
  if (cropLeft === 0 && cropTop === 0 && cropW === layerW && cropH === layerH) {
    return { input, left: destLeft, top: destTop };
  }
  const cropped = await sharp(input)
    .extract({
      left: Math.round(cropLeft),
      top: Math.round(cropTop),
      width: Math.round(cropW),
      height: Math.round(cropH),
    })
    .png()
    .toBuffer();
  return { input: cropped, left: Math.round(destLeft), top: Math.round(destTop) };
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
