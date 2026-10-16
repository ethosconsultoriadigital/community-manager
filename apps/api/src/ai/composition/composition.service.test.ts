import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { CompositionService } from './composition.service';
import { logoPosition, parseClientBrand } from './brand-layout';

describe('brand-layout helpers', () => {
  it('garantiza layout post_feed por defecto', () => {
    const brand = parseClientBrand({});
    expect(brand.layouts.post_feed.canvas).toEqual({ width: 1080, height: 1350 });
  });

  it('calcula ancla top-left con margen', () => {
    const pos = logoPosition({
      canvasW: 1080,
      canvasH: 1350,
      logoW: 200,
      logoH: 80,
      anchor: 'top-left',
      margin: 40,
    });
    expect(pos).toEqual({ left: 40, top: 40 });
  });
});

function serviceWith(brand: unknown, logo: Buffer, background: Buffer) {
  const clients = {
    findById: vi.fn().mockResolvedValue({ id: 'client-1', brand }),
  };
  const mediaStorage = {
    readBytesFromUrl: vi
      .fn()
      .mockResolvedValue({ buffer: logo, contentType: 'image/png' }),
  };
  return new CompositionService(clients as never, mediaStorage as never);
}

async function rawPixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width ?? 1;
  const o = (y * width + x) * 4;
  return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!] as const;
}

describe('CompositionService', () => {
  it('respeta un layout explícito y no recorta un logo de color sólido', async () => {
    const background = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 30, g: 80, b: 160 },
      },
    })
      .png()
      .toBuffer();

    const logo = await sharp({
      create: {
        width: 300,
        height: 150,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const service = serviceWith(
      {
        logoUrl: 'https://storage.local/logo.png',
        layouts: {
          post_feed: {
            canvas: { width: 1080, height: 1350 },
            logo: { anchor: 'bottom-right', maxWidth: 220, maxHeight: 120, margin: 48 },
            text: [
              {
                field: 'title',
                x: 64,
                y: 200,
                size: 48,
                color: '#FFFFFF',
                maxWidth: 952,
                align: 'left',
                font: 'bold',
              },
            ],
          },
        },
      },
      logo,
      background,
    );

    const result = await service.compose({
      background,
      agencyId: 'agency-1',
      clientId: 'client-1',
      layoutKey: 'post_feed',
      fields: { title: 'Promo 2x1' },
    });

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    // 300×150 dentro de 220×120 → 220×110. Ancla bottom-right, margen 48.
    const left = 1080 - 220 - 48;
    const top = 1350 - 110 - 48;
    const [r, g, b] = await rawPixel(result.buffer, left + 10, top + 10);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);

    const [br, bg, bb] = await rawPixel(result.buffer, 40, 40);
    expect(br).toBeLessThan(80);
    expect(bg).toBeGreaterThan(40);
    expect(bb).toBeGreaterThan(100);
  });

  it('pega el logo tal cual, con su fondo, sin recortar ni teñir', async () => {
    const background = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 210, g: 220, b: 200 },
      },
    })
      .png()
      .toBuffer();
    const raw = Buffer.alloc(80 * 40 * 4, 255);
    for (let y = 12; y < 28; y++) {
      for (let x = 28; x < 52; x++) {
        const o = (y * 80 + x) * 4;
        raw[o] = 10;
        raw[o + 1] = 20;
        raw[o + 2] = 40;
        raw[o + 3] = 255;
      }
    }
    const logo = await sharp(raw, { raw: { width: 80, height: 40, channels: 4 } })
      .png()
      .toBuffer();

    const service = serviceWith(
      {
        logoUrl: 'https://storage.local/logo.png',
        layouts: {
          post_feed: {
            canvas: { width: 400, height: 300 },
            logo: { anchor: 'top-left', maxWidth: 200, maxHeight: 100, margin: 36 },
            text: [],
          },
        },
      },
      logo,
      background,
    );
    const result = await service.compose({
      background,
      agencyId: 'agency-1',
      clientId: 'client-1',
      fields: {},
    });

    const [r, g, b] = await rawPixel(result.buffer, 38, 38);
    expect([r, g, b]).toEqual([255, 255, 255]);
    const [mr, mg, mb] = await rawPixel(result.buffer, 36 + 40, 36 + 20);
    expect([mr, mg, mb]).toEqual([10, 20, 40]);
    const [or, og, ob] = await rawPixel(result.buffer, 10, 10);
    expect([or, og, ob]).toEqual([210, 220, 200]);
  });

  it('coloca solo el logo en la zona calma y fuera de la cara', async () => {
    const width = 480;
    const height = 600;
    const photo = Buffer.alloc(width * height * 3);
    const cx = 240;
    const cy = 300;
    const rx = 100;
    const ry = 130;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 3;
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const onFace = dx * dx + dy * dy <= 1;
        const busy = x < width / 2;
        let r: number;
        let g: number;
        let b: number;
        if (onFace) {
          r = 214;
          g = 156;
          b = 124;
        } else if (busy) {
          const n = (Math.imul(x, 17) + Math.imul(y, 31)) & 255;
          r = n > 128 ? 210 : 40;
          g = n > 128 ? 50 : 80;
          b = n > 128 ? 40 : 200;
        } else {
          r = 186;
          g = 198;
          b = 184;
        }
        photo[o] = r;
        photo[o + 1] = g;
        photo[o + 2] = b;
      }
    }
    const background = await sharp(photo, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const logoRaw = Buffer.alloc(72 * 36 * 4);
    for (let i = 0; i < 72 * 36; i++) {
      logoRaw[i * 4] = 12;
      logoRaw[i * 4 + 1] = 18;
      logoRaw[i * 4 + 2] = 32;
      logoRaw[i * 4 + 3] = 255;
    }
    const logo = await sharp(logoRaw, { raw: { width: 72, height: 36, channels: 4 } })
      .png()
      .toBuffer();

    const service = serviceWith(
      {
        logoUrl: 'https://storage.local/logo.png',
        layouts: {
          post_feed: {
            canvas: { width, height },
            text: [
              {
                field: 'title',
                x: 24,
                y: 540,
                size: 28,
                color: '#FFFFFF',
                maxWidth: 430,
                align: 'left',
                font: 'bold',
              },
            ],
          },
        },
      },
      logo,
      background,
    );
    const result = await service.compose({
      background,
      agencyId: 'agency-1',
      clientId: 'client-1',
      fields: { title: 'Titular de la pieza' },
    });

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let hits = 0;
    const { data, info } = await sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const outW = info.width ?? width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < outW; x++) {
        const o = (y * outW + x) * 4;
        if (data[o]! < 30 && data[o + 1]! < 40 && data[o + 2]! < 55) {
          hits++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    expect(hits).toBeGreaterThan(100);
    expect(minX).toBeGreaterThan(width / 2);
    expect(maxY).toBeLessThan(520);
    const overlapsFace = (() => {
      for (let y = minY; y <= maxY; y += 2) {
        for (let x = minX; x <= maxX; x += 2) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) return true;
        }
      }
      return false;
    })();
    expect(overlapsFace).toBe(false);
  });
});
