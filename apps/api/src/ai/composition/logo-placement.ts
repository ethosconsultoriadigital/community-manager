import sharp from 'sharp';

/**
 * Elige un rectángulo con margen para el logo, sin tocar sus píxeles.
 * Evita detalle, piel, letras, focos mucho más claros que el resto y el centro.
 * Si queda alguna celda libre de piel, texto y foco, no usa las demás.
 */

const ANALYSIS_MAX_WIDTH = 180;
const SKIN_BLOCK = 0.04;
const TEXT_BLOCK = 0.05;
const OVERLAP_BLOCK = 0.2;
const HIGHLIGHT_L = 0.84;
const HIGHLIGHT_ABOVE_MEDIAN = 0.18;

export type RgbImage = {
  data: Uint8Array;
  width: number;
  height: number;
  /** Varianza de color del bloque original (el promedio al reducir borra el patrón). */
  busyness?: Float32Array;
  skinFrac?: Float32Array;
  textFrac?: Float32Array;
};

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LogoPlacement = {
  left: number;
  top: number;
};

export async function downsampleRgb(
  png: Buffer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<RgbImage> {
  const source = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sw = source.info.width ?? canvasWidth;
  const sh = source.info.height ?? canvasHeight;
  const width = Math.max(8, Math.min(ANALYSIS_MAX_WIDTH, sw));
  const height = Math.max(8, Math.round((sh * width) / sw));
  const data = new Uint8Array(width * height * 3);
  const busyness = new Float32Array(width * height);
  const skinFrac = new Float32Array(width * height);
  const textFrac = new Float32Array(width * height);
  const src = source.data;

  for (let ay = 0; ay < height; ay++) {
    const y0 = Math.floor((ay * sh) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((ay + 1) * sh) / height));
    for (let ax = 0; ax < width; ax++) {
      const x0 = Math.floor((ax * sw) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((ax + 1) * sw) / width));
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sr2 = 0;
      let sg2 = 0;
      let sb2 = 0;
      let skin = 0;
      let text = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * sw + x) * 3;
          const r = src[o]!;
          const g = src[o + 1]!;
          const b = src[o + 2]!;
          sr += r;
          sg += g;
          sb += b;
          sr2 += r * r;
          sg2 += g * g;
          sb2 += b * b;
          if (isSkin(r, g, b)) skin++;
          const nx = Math.min(sw - 1, x + 1);
          const ny = Math.min(sh - 1, y + 1);
          const ox = (y * sw + nx) * 3;
          const oy = (ny * sw + x) * 3;
          const lHere = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const lX =
            (0.2126 * src[ox]! + 0.7152 * src[ox + 1]! + 0.0722 * src[ox + 2]!) / 255;
          const lY =
            (0.2126 * src[oy]! + 0.7152 * src[oy + 1]! + 0.0722 * src[oy + 2]!) / 255;
          const e = Math.abs(lX - lHere) + Math.abs(lY - lHere);
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (e >= 0.18 && chroma <= 42 && (lHere <= 0.18 || lHere >= 0.82)) text++;
          n++;
        }
      }
      const i = ay * width + ax;
      const meanR = sr / n;
      const meanG = sg / n;
      const meanB = sb / n;
      data[i * 3] = Math.round(meanR);
      data[i * 3 + 1] = Math.round(meanG);
      data[i * 3 + 2] = Math.round(meanB);
      const varSum =
        sr2 / n - meanR * meanR + (sg2 / n - meanG * meanG) + (sb2 / n - meanB * meanB);
      busyness[i] = Math.max(0, varSum) / (255 * 255);
      skinFrac[i] = skin / n;
      textFrac[i] = text / n;
    }
  }

  return { data, width, height, busyness, skinFrac, textFrac };
}

export function chooseLogoPlacement(input: {
  image: RgbImage;
  canvasWidth: number;
  canvasHeight: number;
  logoWidth: number;
  logoHeight: number;
  margin: number;
  avoid?: PixelRect[];
}): LogoPlacement {
  const canvasWidth = Math.max(1, input.canvasWidth);
  const canvasHeight = Math.max(1, input.canvasHeight);
  const logoWidth = Math.max(1, Math.min(input.logoWidth, canvasWidth));
  const logoHeight = Math.max(1, Math.min(input.logoHeight, canvasHeight));
  const maps = buildMaps(input.image);
  const medianL = medianLuminance(maps.simpleL);
  const scaleX = input.image.width / canvasWidth;
  const scaleY = input.image.height / canvasHeight;
  const spots = candidateSpots(
    canvasWidth,
    canvasHeight,
    logoWidth,
    logoHeight,
    input.margin,
  );

  const scored = spots.map((spot) => {
    const stats = regionStats(
      maps,
      mapRect(
        { x: spot.left, y: spot.top, width: logoWidth, height: logoHeight },
        scaleX,
        scaleY,
        input.image.width,
        input.image.height,
      ),
    );
    const overlap = overlapRatio(
      { x: spot.left, y: spot.top, width: logoWidth, height: logoHeight },
      input.avoid ?? [],
    );
    const centerProx = centerProximity(
      spot.left + logoWidth / 2,
      spot.top + logoHeight / 2,
      canvasWidth,
      canvasHeight,
    );
    const highlight = focalHighlight(stats.meanL, medianL);
    return { ...spot, ...stats, overlap, centerProx, highlight };
  });

  const open = scored.filter(
    (spot) =>
      spot.skin < SKIN_BLOCK &&
      spot.text < TEXT_BLOCK &&
      spot.overlap < OVERLAP_BLOCK &&
      !spot.highlight,
  );
  const pool = open.length ? open : scored;
  const maxVar = Math.max(...pool.map((spot) => spot.variance), 1e-6);
  const maxColor = Math.max(...pool.map((spot) => spot.colorVar), 1e-6);
  const maxEdge = Math.max(...pool.map((spot) => spot.edge), 1e-6);

  let best = pool[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const spot of pool) {
    const glare = spot.meanL >= HIGHLIGHT_L ? Math.max(0, spot.meanL - medianL) : 0;
    const detail =
      0.25 * (spot.variance / maxVar) +
      0.55 * (spot.colorVar / maxColor) +
      0.35 * (spot.edge / maxEdge) +
      1.7 * spot.skin +
      1.6 * spot.text +
      2.4 * glare +
      3.2 * spot.overlap;
    // El centro suma aunque esté liso: una cara suave o un producto
    // sin textura no deben ganar solo por estar vacíos.
    const importance =
      detail * (0.45 + 1.05 * spot.centerProx) + 0.28 * spot.centerProx;
    const cost = importance;
    const closer =
      cost < bestCost - 0.015 ||
      (Math.abs(cost - bestCost) <= 0.015 &&
        (spot.centerProx < best.centerProx - 0.05 ||
          (Math.abs(spot.centerProx - best.centerProx) <= 0.05 &&
            (spot.top < best.top ||
              (spot.top === best.top && spot.left < best.left)))));
    if (closer) {
      best = spot;
      bestCost = cost;
    }
  }

  return { left: best.left, top: best.top };
}

function focalHighlight(meanL: number, medianL: number): boolean {
  return meanL >= HIGHLIGHT_L && meanL - medianL >= HIGHLIGHT_ABOVE_MEDIAN;
}

function medianLuminance(values: Float32Array): number {
  const bins = new Uint32Array(32);
  for (let i = 0; i < values.length; i++) {
    bins[Math.min(31, Math.floor(values[i]! * 32))]!++;
  }
  const mid = values.length / 2;
  let acc = 0;
  for (let i = 0; i < 32; i++) {
    acc += bins[i]!;
    if (acc >= mid) return (i + 0.5) / 32;
  }
  return 0.5;
}

type Maps = {
  width: number;
  height: number;
  data: Uint8Array;
  simpleL: Float32Array;
  relL: Float32Array;
  edge: Float32Array;
  skin: Uint8Array;
  text: Uint8Array;
  busyness?: Float32Array;
  skinFrac?: Float32Array;
  textFrac?: Float32Array;
};

function buildMaps(image: RgbImage): Maps {
  const { data, width, height } = image;
  const n = width * height;
  const simpleL = new Float32Array(n);
  const relL = new Float32Array(n);
  const edge = new Float32Array(n);
  const skin = new Uint8Array(n);
  const text = new Uint8Array(n);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 3;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      simpleL[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      relL[i] = relativeLuminanceFast(r, g, b);
      if (isSkin(r, g, b)) skin[i] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const x0 = x > 0 ? i - 1 : i;
      const x1 = x + 1 < width ? i + 1 : i;
      const y0 = y > 0 ? i - width : i;
      const y1 = y + 1 < height ? i + width : i;
      const e =
        Math.abs(simpleL[x1]! - simpleL[x0]!) + Math.abs(simpleL[y1]! - simpleL[y0]!);
      edge[i] = e;
      const o = i * 3;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const L = simpleL[i]!;
      if (e >= 0.22 && chroma <= 42 && (L <= 0.18 || L >= 0.82)) text[i] = 1;
    }
  }

  return {
    width,
    height,
    data,
    simpleL,
    relL,
    edge,
    skin,
    text,
    busyness: image.busyness,
    skinFrac: image.skinFrac,
    textFrac: image.textFrac,
  };
}

function regionStats(
  maps: Maps,
  rect: PixelRect,
): {
  variance: number;
  colorVar: number;
  edge: number;
  skin: number;
  text: number;
  meanL: number;
  meanRel: number;
} {
  let sum = 0;
  let sumSq = 0;
  let edgeSum = 0;
  let skinSum = 0;
  let textSum = 0;
  let relSum = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumR2 = 0;
  let sumG2 = 0;
  let sumB2 = 0;
  let busySum = 0;
  let skinFracSum = 0;
  let textFracSum = 0;
  let n = 0;
  const x1 = Math.min(maps.width, rect.x + rect.width);
  const y1 = Math.min(maps.height, rect.y + rect.height);
  for (let y = rect.y; y < y1; y++) {
    for (let x = rect.x; x < x1; x++) {
      const i = y * maps.width + x;
      const L = maps.simpleL[i]!;
      const o = i * 3;
      const r = maps.data[o]! / 255;
      const g = maps.data[o + 1]! / 255;
      const b = maps.data[o + 2]! / 255;
      sum += L;
      sumSq += L * L;
      sumR += r;
      sumG += g;
      sumB += b;
      sumR2 += r * r;
      sumG2 += g * g;
      sumB2 += b * b;
      edgeSum += maps.edge[i]!;
      skinSum += maps.skin[i]!;
      textSum += maps.text[i]!;
      relSum += maps.relL[i]!;
      if (maps.busyness) busySum += maps.busyness[i]!;
      if (maps.skinFrac) skinFracSum += maps.skinFrac[i]!;
      if (maps.textFrac) textFracSum += maps.textFrac[i]!;
      n++;
    }
  }
  if (!n) {
    return {
      variance: 0,
      colorVar: 0,
      edge: 0,
      skin: 0,
      text: 0,
      meanL: 0.5,
      meanRel: 0.5,
    };
  }
  const mean = sum / n;
  const channelVar = (sumC: number, sumC2: number) =>
    Math.max(0, sumC2 / n - (sumC / n) ** 2);
  return {
    variance: Math.max(0, sumSq / n - mean * mean),
    colorVar: maps.busyness
      ? busySum / n
      : channelVar(sumR, sumR2) + channelVar(sumG, sumG2) + channelVar(sumB, sumB2),
    edge: edgeSum / n,
    skin: maps.skinFrac ? skinFracSum / n : skinSum / n,
    text: maps.textFrac ? textFracSum / n : textSum / n,
    meanL: mean,
    meanRel: relSum / n,
  };
}

function candidateSpots(
  canvasWidth: number,
  canvasHeight: number,
  logoWidth: number,
  logoHeight: number,
  margin: number,
): Array<{ left: number; top: number }> {
  const minX = Math.max(0, Math.min(margin, Math.max(0, canvasWidth - logoWidth)));
  const minY = Math.max(0, Math.min(margin, Math.max(0, canvasHeight - logoHeight)));
  const maxX = Math.max(minX, canvasWidth - logoWidth - margin);
  const maxY = Math.max(minY, canvasHeight - logoHeight - margin);
  const cols = 7;
  const rows = 5;
  const spots: Array<{ left: number; top: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = Math.round(minX + ((maxX - minX) * col) / (cols - 1));
      const top = Math.round(minY + ((maxY - minY) * row) / (rows - 1));
      spots.push({ left, top });
    }
  }
  return spots;
}

function mapRect(
  rect: PixelRect,
  scaleX: number,
  scaleY: number,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const x = clamp(Math.floor(rect.x * scaleX), 0, imageWidth - 1);
  const y = clamp(Math.floor(rect.y * scaleY), 0, imageHeight - 1);
  const right = clamp(Math.ceil((rect.x + rect.width) * scaleX), x + 1, imageWidth);
  const bottom = clamp(Math.ceil((rect.y + rect.height) * scaleY), y + 1, imageHeight);
  return { x, y, width: right - x, height: bottom - y };
}

function overlapRatio(rect: PixelRect, avoid: PixelRect[]): number {
  const area = Math.max(1, rect.width * rect.height);
  let inter = 0;
  for (const block of avoid) {
    const x = Math.max(rect.x, block.x);
    const y = Math.max(rect.y, block.y);
    const right = Math.min(rect.x + rect.width, block.x + block.width);
    const bottom = Math.min(rect.y + rect.height, block.y + block.height);
    if (right > x && bottom > y) inter += (right - x) * (bottom - y);
  }
  return Math.min(1, inter / area);
}

function centerProximity(x: number, y: number, width: number, height: number): number {
  const dx = (x - width / 2) / Math.max(width / 2, 1);
  const dy = (y - height / 2) / Math.max(height / 2, 1);
  const dist = Math.min(1, Math.hypot(dx, dy) / Math.SQRT2);
  return 1 - dist;
}

function isSkin(r: number, g: number, b: number): boolean {
  if (r < 45 || g < 25 || b < 12 || r <= g || r <= b || r - g < 8) return false;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb > 77 && cb < 127 && cr > 133 && cr < 173;
}

function relativeLuminanceFast(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
