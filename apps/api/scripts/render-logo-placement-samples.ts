/**
 * Muestras de composición (no las compila Nest). Fotos sintéticas + logos de
 * varios tipos, para revisar a ojo la colocación automática.
 *
 *   pnpm exec tsx apps/api/scripts/render-logo-placement-samples.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  parseClientBrand,
  resolveLayout,
  type ResolvedBrandLayout,
} from '../src/ai/composition/brand-layout';
import { composeBrandImage } from '../src/ai/composition/compose-brand';

const OUT = '/opt/cursor/artifacts';

type Rgb = [number, number, number];
type Zone = { x: number; y: number; width: number; height: number; label: string };

function hash(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

async function paint(
  width: number,
  height: number,
  fn: (x: number, y: number) => Rgb,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const o = (y * width + x) * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

function layoutFor(width: number, height: number): ResolvedBrandLayout {
  const size = Math.round(Math.min(width, height) * 0.046);
  return resolveLayout(
    parseClientBrand({
      layouts: {
        post_feed: {
          canvas: { width, height },
          text: [
            {
              field: 'title',
              x: Math.round(width * 0.06),
              y: Math.round(height * 0.9),
              size,
              color: '#FFFFFF',
              maxWidth: Math.round(width * 0.88),
              align: 'left',
              font: 'bold',
            },
          ],
        },
      },
    }),
    'post_feed',
  );
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: Zone,
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function svg(markup: string): Promise<Buffer> {
  return sharp(Buffer.from(markup)).png().toBuffer();
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(
      `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`,
    );
  }
  return pts.join(' ');
}

async function logoEthos(): Promise<Buffer> {
  return svg(
    `<svg width="640" height="640" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="640" height="640" fill="#ffffff"/>` +
      `<circle cx="320" cy="270" r="188" fill="#3f5f78"/>` +
      `<path d="M160 270 A160 160 0 0 1 480 270" fill="none" stroke="#d7e2ea" stroke-width="14"/>` +
      `<circle cx="320" cy="270" r="78" fill="#ffffff"/>` +
      `<polygon points="${star(320, 270, 46)}" fill="#e6d3a1"/>` +
      `<text x="320" y="545" text-anchor="middle" font-family="Georgia, serif" font-size="78" ` +
      `fill="#3f5f78">ETHOS</text>` +
      `</svg>`,
  );
}

async function logoWideWordmark(): Promise<Buffer> {
  return svg(
    `<svg width="860" height="220" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="24" y="148" font-family="Arial, Helvetica, sans-serif" font-size="104" ` +
      `font-weight="700" fill="#1c2430">NORTHWIND</text>` +
      `</svg>`,
  );
}

async function logoTall(): Promise<Buffer> {
  return svg(
    `<svg width="300" height="760" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="300" height="760" fill="#000000"/>` +
      `<circle cx="150" cy="150" r="78" fill="none" stroke="#f4f1ea" stroke-width="10"/>` +
      `<text x="150" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#f4f1ea">A</text>` +
      `<text x="150" y="360" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#f4f1ea">L</text>` +
      `<text x="150" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#f4f1ea">T</text>` +
      `<text x="150" y="580" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#f4f1ea">O</text>` +
      `<text x="150" y="680" text-anchor="middle" font-family="Arial" font-size="28" letter-spacing="6" fill="#f4f1ea">STUDIO</text>` +
      `</svg>`,
  );
}

async function logoLightWordmark(): Promise<Buffer> {
  return svg(
    `<svg width="780" height="200" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="20" y="138" font-family="Arial, Helvetica, sans-serif" font-size="108" ` +
      `font-weight="700" fill="#ffffff">LUMEN</text>` +
      `</svg>`,
  );
}

async function logoOnRed(): Promise<Buffer> {
  return svg(
    `<svg width="520" height="520" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="520" height="520" fill="#c4232b"/>` +
      `<rect x="150" y="120" width="220" height="220" fill="#142033"/>` +
      `<circle cx="260" cy="230" r="48" fill="#f2efe6"/>` +
      `<text x="260" y="430" text-anchor="middle" font-family="Arial" font-size="64" ` +
      `font-weight="700" fill="#142033">ROJO</text>` +
      `</svg>`,
  );
}

async function logoJpeg(): Promise<Buffer> {
  const png = await svg(
    `<svg width="840" height="240" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="840" height="240" fill="#ffffff"/>` +
      `<rect x="36" y="48" width="120" height="140" fill="#12306e"/>` +
      `<text x="180" y="148" font-family="Arial" font-size="84" font-weight="700" fill="#12306e">CAMPO</text>` +
      `</svg>`,
  );
  return sharp(png).jpeg({ quality: 92 }).toBuffer();
}

async function landscape(
  width: number,
  height: number,
): Promise<{ photo: Buffer; forbid: Zone[] }> {
  const horizon = Math.round(height * 0.46);
  const photo = await paint(width, height, (x, y) => {
    if (y < horizon) {
      const t = y / horizon;
      return [
        clampByte(150 - t * 40),
        clampByte(196 - t * 30),
        clampByte(230 - t * 10),
      ];
    }
    const ridge =
      horizon + Math.round(Math.sin(x * 0.02) * 36 + Math.sin(x * 0.008) * 70);
    if (y < ridge + 90) {
      const n = hash(x, y);
      return [clampByte(70 + n * 40), clampByte(90 + n * 30), clampByte(80 + n * 20)];
    }
    const n = hash(Math.floor(x / 3), Math.floor(y / 3));
    return [clampByte(50 + n * 40), clampByte(110 + n * 50), clampByte(45 + n * 20)];
  });
  return {
    photo,
    forbid: [
      {
        x: Math.round(width * 0.12),
        y: horizon - 20,
        width: Math.round(width * 0.76),
        height: Math.round(height * 0.28),
        label: 'montaña',
      },
    ],
  };
}

async function portrait(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1350;
  const cx = 540;
  const cy = 560;
  const photo = await paint(width, height, (x, y) => {
    const wall = 210 + (y / height) * 18;
    const dx = (x - cx) / 210;
    const dy = (y - cy) / 260;
    if (dx * dx + dy * dy <= 1) {
      const cheek = dx * dx + dy * dy;
      return [clampByte(206 - cheek * 18), clampByte(154 - cheek * 10), clampByte(124)];
    }
    const hair = (x - cx) / 230;
    const hy = (y - 400) / 180;
    if (hair * hair + hy * hy <= 1 && y < cy) return [48, 36, 32];
    const body = x > 360 && x < 720 && y > 760;
    if (body) {
      const n = hash(Math.floor(x / 6), Math.floor(y / 6));
      return n > 0.5 ? [40, 70, 120] : [20, 40, 80];
    }
    return [clampByte(wall), clampByte(wall - 6), clampByte(wall - 14)];
  });
  return {
    photo,
    width,
    height,
    forbid: [{ x: 330, y: 240, width: 420, height: 980, label: 'persona' }],
  };
}

async function headlineStory(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1920;
  const photo = await paint(width, height, (x, y) => {
    if (y < 620) {
      const paper = y > 80 && y < 560 && x > 70 && x < 1010;
      if (!paper) return [28, 36, 48];
      const line = Math.floor((y - 90) / 28);
      const col = Math.floor((x - 90) / 36);
      const ink = line >= 0 && line < 16 && col % 5 !== 4 && (y - 90) % 28 < 16;
      return ink ? [16, 16, 18] : [244, 244, 242];
    }
    const inProduct = x > 360 && x < 760 && y > 860 && y < 1500;
    if (inProduct) {
      const n = hash(x, y);
      return [clampByte(180 + n * 50), clampByte(90 + n * 40), clampByte(40 + n * 30)];
    }
    const t = (y - 620) / (height - 620);
    return [clampByte(90 + t * 30), clampByte(120 + t * 20), clampByte(110)];
  });
  return {
    photo,
    width,
    height,
    forbid: [
      { x: 60, y: 70, width: 960, height: 520, label: 'titular' },
      { x: 340, y: 840, width: 440, height: 680, label: 'producto' },
    ],
  };
}

async function productSquare(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1080;
  const photo = await paint(width, height, (x, y) => {
    const inBox = x > 330 && x < 750 && y > 250 && y < 860;
    if (!inBox) return [214, 214, 208];
    const label = y > 520 && y < 700 && x > 400 && x < 680;
    if (label) {
      const ink = Math.floor((y - 520) / 18) % 2 === 0 && (x - 400) % 22 < 14;
      return ink ? [20, 20, 20] : [245, 245, 240];
    }
    const n = hash(Math.floor(x / 4), Math.floor(y / 4));
    return [clampByte(160 + n * 70), clampByte(70 + n * 40), clampByte(40)];
  });
  return {
    photo,
    width,
    height,
    forbid: [{ x: 310, y: 230, width: 460, height: 660, label: 'producto' }],
  };
}

async function nightScene(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1350;
  const photo = await paint(width, height, (x, y) => {
    const win = x > 430 && x < 650 && y > 480 && y < 780;
    if (win) {
      const n = hash(Math.floor(x / 5), Math.floor(y / 5));
      const mullion = x % 55 < 4 || y % 70 < 4;
      return mullion
        ? [40, 36, 28]
        : [clampByte(230 + n * 20), clampByte(200 + n * 20), 120];
    }
    const v = 8 + (y / height) * 10;
    return [clampByte(v), clampByte(v + 2), clampByte(v + 6)];
  });
  return {
    photo,
    width,
    height,
    forbid: [{ x: 400, y: 450, width: 280, height: 360, label: 'ventana' }],
  };
}

async function busyWithQuiet(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1350;
  const photo = await paint(width, height, (x, y) => {
    const quiet = x > 520 && x < 900 && y > 500 && y < 860;
    if (quiet) return [168, 176, 170];
    const n = hash(x, y);
    return n > 0.5 ? [210, 48, 62] : [36, 78, 190];
  });
  return {
    photo,
    width,
    height,
    forbid: [{ x: 0, y: 0, width: 500, height, label: 'patrón' }],
  };
}

async function highKey(): Promise<{
  photo: Buffer;
  forbid: Zone[];
  width: number;
  height: number;
}> {
  const width = 1080;
  const height = 1350;
  const photo = await paint(width, height, (x, y) => {
    const dx = (x - 540) / 180;
    const dy = (y - 640) / 220;
    if (dx * dx + dy * dy <= 1) {
      const n = hash(Math.floor(x / 3), Math.floor(y / 3));
      return [
        clampByte(230 - n * 25),
        clampByte(210 - n * 20),
        clampByte(190 - n * 15),
      ];
    }
    return [248, 246, 242];
  });
  return {
    photo,
    width,
    height,
    forbid: [{ x: 340, y: 400, width: 400, height: 480, label: 'sujeto claro' }],
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const [ethos, wide, tall, light, red, jpeg] = await Promise.all([
    logoEthos(),
    logoWideWordmark(),
    logoTall(),
    logoLightWordmark(),
    logoOnRed(),
    logoJpeg(),
  ]);

  const land = await landscape(1920, 1080);
  const face = await portrait();
  const story = await headlineStory();
  const product = await productSquare();
  const night = await nightScene();
  const busy = await busyWithQuiet();
  const bright = await highKey();

  const jobs: Array<{
    name: string;
    background: Buffer;
    logo: Buffer;
    width: number;
    height: number;
    forbid: Zone[];
    title: string;
  }> = [
    {
      name: 'logo_ethos_landscape_16x9',
      background: land.photo,
      logo: ethos,
      width: 1920,
      height: 1080,
      forbid: land.forbid,
      title: 'Valle al atardecer',
    },
    {
      name: 'logo_ethos_face_4x5',
      background: face.photo,
      logo: ethos,
      width: face.width,
      height: face.height,
      forbid: face.forbid,
      title: 'Retrato en estudio',
    },
    {
      name: 'logo_ethos_headline_9x16',
      background: story.photo,
      logo: ethos,
      width: story.width,
      height: story.height,
      forbid: story.forbid,
      title: 'Historia con titular',
    },
    {
      name: 'logo_ethos_product_1x1',
      background: product.photo,
      logo: ethos,
      width: product.width,
      height: product.height,
      forbid: product.forbid,
      title: 'Producto de temporada',
    },
    {
      name: 'logo_ethos_dark_4x5',
      background: night.photo,
      logo: ethos,
      width: night.width,
      height: night.height,
      forbid: night.forbid,
      title: 'Noche en el local',
    },
    {
      name: 'logo_ethos_busy_4x5',
      background: busy.photo,
      logo: ethos,
      width: busy.width,
      height: busy.height,
      forbid: busy.forbid,
      title: 'Patrón con respiro',
    },
    {
      name: 'logo_ethos_bright_4x5',
      background: bright.photo,
      logo: ethos,
      width: bright.width,
      height: bright.height,
      forbid: bright.forbid,
      title: 'Clave alta',
    },
    {
      name: 'logo_wordmark_product_1x1',
      background: product.photo,
      logo: wide,
      width: product.width,
      height: product.height,
      forbid: product.forbid,
      title: 'Wordmark ancho',
    },
    {
      name: 'logo_tall_bright_4x5',
      background: bright.photo,
      logo: tall,
      width: bright.width,
      height: bright.height,
      forbid: bright.forbid,
      title: 'Marca vertical',
    },
    {
      name: 'logo_light_wordmark_dark_4x5',
      background: night.photo,
      logo: light,
      width: night.width,
      height: night.height,
      forbid: night.forbid,
      title: 'Wordmark claro',
    },
    {
      name: 'logo_redbg_landscape_16x9',
      background: land.photo,
      logo: red,
      width: 1920,
      height: 1080,
      forbid: land.forbid,
      title: 'Logo sobre rojo',
    },
    {
      name: 'logo_jpeg_face_4x5',
      background: face.photo,
      logo: jpeg,
      width: face.width,
      height: face.height,
      forbid: face.forbid,
      title: 'Logo JPEG',
    },
    {
      name: 'logo_light_wordmark_bright_1x1',
      background: product.photo,
      logo: light,
      width: product.width,
      height: product.height,
      forbid: product.forbid,
      title: 'Claro sobre claro',
    },
  ];

  const failures: string[] = [];
  for (const job of jobs) {
    const composed = await composeBrandImage({
      background: job.background,
      logo: job.logo,
      layout: layoutFor(job.width, job.height),
      fields: { title: job.title },
    });
    const box = {
      x: composed.logoLeft,
      y: composed.logoTop,
      width: composed.logoWidth,
      height: composed.logoHeight,
    };
    const hit = job.forbid.filter((zone) => overlaps(box, zone));
    const file = join(OUT, `${job.name}.png`);
    await sharp(composed.buffer).png().toFile(file);
    const where = `${box.x},${box.y} ${box.width}x${box.height} backdrop=${composed.needsBackdrop}`;
    if (hit.length) {
      failures.push(
        `${job.name} tapa ${hit.map((z) => z.label).join(', ')} (${where})`,
      );
    }
    console.log(`${job.name} ${where}`);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
