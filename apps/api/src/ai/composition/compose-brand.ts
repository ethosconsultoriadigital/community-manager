import sharp from 'sharp';
import {
  autoLogoBox,
  DEFAULT_POST_FEED_LAYOUT,
  logoPosition,
  type BrandTextField,
  type ResolvedBrandLayout,
} from './brand-layout';
import {
  chooseLogoPlacement,
  chooseTextBand,
  downsampleRgb,
  type PixelRect,
  type RgbImage,
} from './logo-placement';
import {
  estimateLineWidth,
  fitTextLines,
  isLightColor,
  sanitizeOverlayText,
} from './overlay-text';

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

  let left: number;
  let top: number;
  let blocks: PlacedTextBlock[];
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
    // Logo fijo: el texto busca su franja fuera del logo.
    blocks = placeTextBlocks({
      canvas: input.layout.canvas,
      textFields: input.layout.text,
      fields: input.fields,
      image: analysis,
      avoid: [{ x: left, y: top, width: logoW, height: logoH }],
    });
  } else {
    // Logo automático: primero el texto, luego el logo lo evita.
    blocks = placeTextBlocks({
      canvas: input.layout.canvas,
      textFields: input.layout.text,
      fields: input.fields,
      image: analysis,
    });
    const avoid = textAvoidRects(blocks);
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

  // El texto va debajo y el logo encima: la banda nunca tiñe el logo.
  const composites: sharp.OverlayOptions[] = [];
  const svgText = buildTextSvg(input.layout.canvas, blocks);
  if (svgText) composites.push({ input: Buffer.from(svgText), left: 0, top: 0 });
  composites.push({ input: logoBuffer, left, top });

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

/** Bloque de texto ya colocado: líneas, tamaño, posición y su banda. */
export type PlacedTextBlock = {
  spec: BrandTextField;
  lines: string[];
  size: number;
  /** x del texto según alineación (start/middle/end). */
  textX: number;
  anchor: 'start' | 'middle' | 'end';
  /** Línea base de la primera línea. */
  baselineY: number;
  lineHeight: number;
  band: PixelRect;
  auto: boolean;
};

const DEFAULT_TITLE = DEFAULT_POST_FEED_LAYOUT.text[0]!;

/** El título del layout por defecto (o guardado igual) se coloca solo. */
export function isDefaultTitleSpec(spec: BrandTextField): boolean {
  return (
    spec.x === DEFAULT_TITLE.x &&
    spec.y === DEFAULT_TITLE.y &&
    spec.size === DEFAULT_TITLE.size &&
    spec.maxWidth === DEFAULT_TITLE.maxWidth &&
    spec.align === DEFAULT_TITLE.align
  );
}

/**
 * Coloca cada campo de texto. El título por defecto busca la franja más limpia
 * (sin caras, sin zonas cargadas o muy brillantes, fuera del logo fijo). Un
 * layout con posición propia se respeta tal cual.
 */
export function placeTextBlocks(input: {
  canvas: { width: number; height: number };
  textFields: BrandTextField[];
  fields: Record<string, string>;
  image?: RgbImage;
  avoid?: PixelRect[];
}): PlacedTextBlock[] {
  const { width: canvasW, height: canvasH } = input.canvas;
  const placed: PlacedTextBlock[] = [];
  for (const spec of input.textFields) {
    const text = sanitizeOverlayText(input.fields[spec.field]);
    if (!text) continue;
    const auto = isDefaultTitleSpec(spec) && Boolean(input.image);

    if (auto) {
      const scale = canvasW / DEFAULT_POST_FEED_LAYOUT.canvas.width;
      const margin = Math.max(16, Math.round(DEFAULT_TITLE.x * scale));
      const maxWidth = Math.max(80, canvasW - 2 * margin);
      const baseSize = Math.max(18, Math.round(spec.size * scale));
      const fitted = fitTextLines(text, maxWidth, baseSize, 2, Math.round(baseSize * 0.72));
      const size = fitted.size;
      const lineHeight = Math.round(size * 1.2);
      const pad = Math.round(size * 0.35);
      const blockH = blockHeight(fitted.lines.length, size, lineHeight, pad);
      const textW = Math.min(
        maxWidth,
        Math.max(...fitted.lines.map((l) => estimateLineWidth(l, size))),
      );
      const bandLeft = Math.max(0, margin - pad);
      const chosen = chooseTextBand({
        image: input.image!,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        blockWidth: Math.min(canvasW - bandLeft, textW + 2 * pad),
        blockHeight: blockH,
        left: bandLeft,
        margin: Math.max(12, Math.round(margin * 0.6)),
        avoid: input.avoid,
      });
      placed.push({
        spec,
        lines: fitted.lines,
        size,
        textX: margin,
        anchor: 'start',
        baselineY: chosen.top + pad + Math.round(size * 0.85),
        lineHeight,
        band: {
          x: bandLeft,
          y: chosen.top,
          width: Math.min(canvasW - bandLeft, textW + 2 * pad),
          height: blockH,
        },
        auto: true,
      });
      continue;
    }

    const fitted = fitTextLines(text, spec.maxWidth, spec.size, 4);
    const size = fitted.size;
    const lineHeight = Math.round(size * 1.2);
    const pad = Math.round(size * 0.3);
    const anchor =
      spec.align === 'center' ? 'middle' : spec.align === 'right' ? 'end' : 'start';
    const textX =
      spec.align === 'center'
        ? spec.x + Math.round(spec.maxWidth / 2)
        : spec.align === 'right'
          ? spec.x + spec.maxWidth
          : spec.x;
    const textW = Math.min(
      spec.maxWidth,
      Math.max(...fitted.lines.map((l) => estimateLineWidth(l, size))),
    );
    const left =
      anchor === 'middle' ? textX - textW / 2 : anchor === 'end' ? textX - textW : textX;
    const bandX = Math.max(0, Math.round(left - pad));
    const bandY = Math.max(0, Math.round(spec.y - size * 0.85 - pad));
    placed.push({
      spec,
      lines: fitted.lines,
      size,
      textX,
      anchor,
      baselineY: spec.y,
      lineHeight,
      band: {
        x: bandX,
        y: bandY,
        width: Math.min(canvasW - bandX, Math.round(textW + 2 * pad)),
        height: Math.min(canvasH - bandY, blockHeight(fitted.lines.length, size, lineHeight, pad)),
      },
      auto: false,
    });
  }
  return placed;
}

function blockHeight(lines: number, size: number, lineHeight: number, pad: number): number {
  return Math.round(pad * 2 + size * 1.1 + Math.max(0, lines - 1) * lineHeight);
}

/** Zonas que el logo debe evitar: la banda de cada texto colocado. */
export function textAvoidRects(blocks: PlacedTextBlock[]): PixelRect[] {
  return blocks.map((b) => ({ ...b.band }));
}

function buildTextSvg(
  canvas: { width: number; height: number },
  blocks: PlacedTextBlock[],
): string | null {
  const nodes: string[] = [];
  for (const block of blocks) {
    const { spec, size, lineHeight, band } = block;
    const light = isLightColor(spec.color);
    const bandFill = light ? '#000000' : '#FFFFFF';
    const bandOpacity = light ? 0.45 : 0.6;
    const shadowFill = light ? '#000000' : '#FFFFFF';
    const radius = Math.round(size * 0.3);
    nodes.push(
      `<rect x="${band.x}" y="${band.y}" width="${band.width}" height="${band.height}" ` +
        `rx="${radius}" ry="${radius}" fill="${bandFill}" fill-opacity="${bandOpacity}"/>`,
    );
    const weight = spec.font === 'bold' ? '700' : '600';
    const offset = Math.max(1, Math.round(size * 0.04));
    block.lines.forEach((line, i) => {
      const y = block.baselineY + i * lineHeight;
      const common =
        `font-size="${size}" font-family="Arial, Helvetica, sans-serif" ` +
        `font-weight="${weight}" text-anchor="${block.anchor}"`;
      nodes.push(
        `<text x="${block.textX + offset}" y="${y + offset}" fill="${shadowFill}" ` +
          `fill-opacity="0.55" ${common}>${escapeXml(line)}</text>`,
        `<text x="${block.textX}" y="${y}" fill="${escapeXml(spec.color)}" ${common}>` +
          `${escapeXml(line)}</text>`,
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

export { wrapText } from './overlay-text';
