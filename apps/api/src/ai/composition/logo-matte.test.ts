import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { edgeOpaqueLuminance, knockoutUniformBackground } from './logo-matte';

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width ?? 1;
  const o = (y * width + x) * 4;
  return { r: data[o]!, g: data[o + 1]!, b: data[o + 2]!, a: data[o + 3]! };
}

function rgba(width: number, height: number, fill: [number, number, number, number]) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    raw[i * 4] = fill[0];
    raw[i * 4 + 1] = fill[1];
    raw[i * 4 + 2] = fill[2];
    raw[i * 4 + 3] = fill[3];
  }
  return raw;
}

function paint(
  raw: Buffer,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4;
      raw[o] = color[0];
      raw[o + 1] = color[1];
      raw[o + 2] = color[2];
      raw[o + 3] = color[3];
    }
  }
}

async function fromRaw(raw: Buffer, width: number, height: number) {
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

describe('edgeOpaqueLuminance', () => {
  it('ignora el blanco encerrado y usa el contorno oscuro', () => {
    const width = 40;
    const height = 40;
    const raw = new Uint8Array(width * height * 4);
    const cx = 20;
    const cy = 20;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const o = (y * width + x) * 4;
        if (d > 16) continue;
        const dark = d >= 9;
        raw[o] = dark ? 40 : 255;
        raw[o + 1] = dark ? 60 : 255;
        raw[o + 2] = dark ? 80 : 255;
        raw[o + 3] = 255;
      }
    }
    expect(edgeOpaqueLuminance(raw, width, height)).toBeLessThan(0.15);
  });
});

describe('knockoutUniformBackground', () => {
  it('recorta el blanco conectado al borde y conserva el blanco interior', async () => {
    const width = 90;
    const height = 90;
    const raw = rgba(width, height, [255, 255, 255, 255]);
    const cx = 45;
    const cy = 45;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= 18 && d <= 36) {
          const o = (y * width + x) * 4;
          raw[o] = 63;
          raw[o + 1] = 95;
          raw[o + 2] = 120;
          raw[o + 3] = 255;
        }
      }
    }

    const result = await knockoutUniformBackground(await fromRaw(raw, width, height));
    expect(result.knockedOut).toBe(true);
    const corner = await pixel(result.buffer, 2, 2);
    const hole = await pixel(result.buffer, cx, cy);
    const ring = await pixel(result.buffer, cx, cy - 28);
    expect(corner.a).toBe(0);
    expect(hole.a).toBeGreaterThan(200);
    expect(hole.r).toBeGreaterThan(240);
    expect(ring.a).toBeGreaterThan(200);
    expect(ring.b).toBeGreaterThan(ring.r);
  });

  it('no vacía un logo de un solo color', async () => {
    const raw = rgba(40, 40, [255, 0, 0, 255]);
    const result = await knockoutUniformBackground(await fromRaw(raw, 40, 40));
    expect(result.knockedOut).toBe(false);
    const corner = await pixel(result.buffer, 0, 0);
    expect(corner.a).toBe(255);
    expect(corner.r).toBeGreaterThan(200);
    expect(corner.g).toBe(0);
  });

  it('no altera un PNG que ya es transparente', async () => {
    const raw = rgba(60, 40, [0, 0, 0, 0]);
    paint(raw, 60, 40, 10, 55, 30, [20, 60, 180, 255]);
    const result = await knockoutUniformBackground(await fromRaw(raw, 60, 40));
    expect(result.knockedOut).toBe(false);
    const outside = await pixel(result.buffer, 1, 1);
    const mark = await pixel(result.buffer, 48, 20);
    expect(outside.a).toBe(0);
    expect(mark.a).toBe(255);
    expect(mark.b).toBeGreaterThan(150);
  });

  it('recorta fondo negro y fondo de color', async () => {
    const onBlack = rgba(80, 80, [0, 0, 0, 255]);
    paint(onBlack, 80, 22, 30, 58, 50, [250, 250, 250, 255]);
    const black = await knockoutUniformBackground(await fromRaw(onBlack, 80, 80));
    expect(black.knockedOut).toBe(true);
    expect((await pixel(black.buffer, 1, 1)).a).toBe(0);
    const bar = await pixel(black.buffer, 40, 40);
    expect(bar.a).toBeGreaterThan(200);
    expect(bar.r).toBeGreaterThan(230);

    const onRed = rgba(80, 80, [210, 30, 40, 255]);
    paint(onRed, 80, 25, 25, 55, 55, [16, 32, 64, 255]);
    const red = await knockoutUniformBackground(await fromRaw(onRed, 80, 80));
    expect(red.knockedOut).toBe(true);
    expect((await pixel(red.buffer, 1, 1)).a).toBe(0);
    const mark = await pixel(red.buffer, 40, 40);
    expect(mark.a).toBeGreaterThan(200);
    expect(mark.b).toBeGreaterThan(mark.r);
  });

  it('recorta el blanco de un JPEG', async () => {
    const mark = await sharp({
      create: {
        width: 28,
        height: 18,
        channels: 3,
        background: { r: 16, g: 48, b: 180 },
      },
    })
      .png()
      .toBuffer();
    const jpeg = await sharp({
      create: {
        width: 90,
        height: 50,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: mark, left: 31, top: 16 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await knockoutUniformBackground(jpeg);
    expect(result.knockedOut).toBe(true);
    expect((await pixel(result.buffer, 2, 2)).a).toBeLessThan(10);
    const center = await pixel(result.buffer, 45, 25);
    expect(center.a).toBeGreaterThan(200);
    expect(center.b).toBeGreaterThan(120);
  });

  it('no recorta una foto cuyo borde no es uniforme', async () => {
    const width = 48;
    const height = 36;
    const raw = rgba(width, height, [0, 0, 0, 255]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        raw[o] = (x * 9) % 256;
        raw[o + 1] = (y * 13) % 256;
        raw[o + 2] = (x * 3 + y * 5) % 256;
        raw[o + 3] = 255;
      }
    }
    const result = await knockoutUniformBackground(await fromRaw(raw, width, height));
    expect(result.knockedOut).toBe(false);
    expect((await pixel(result.buffer, 0, 0)).a).toBe(255);
  });
});
