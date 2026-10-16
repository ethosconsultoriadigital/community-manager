import { describe, expect, it } from 'vitest';
import {
  autoLogoBox,
  isCustomLogoLayout,
  resolveLayout,
  parseClientBrand,
} from './brand-layout';
import { chooseLogoPlacement, type RgbImage } from './logo-placement';

function scene(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * width + x) * 3;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
    }
  }
  return { data, width, height };
}

function hash(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function hitsEllipse(
  left: number,
  top: number,
  logoW: number,
  logoH: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  for (let y = top; y < top + logoH; y += 2) {
    for (let x = left; x < left + logoW; x += 2) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
  }
  return false;
}

describe('autoLogoBox / resolveLayout', () => {
  it('en 1080×1350 mantiene el tamaño histórico', () => {
    expect(autoLogoBox(1080, 1350)).toMatchObject({
      maxWidth: 360,
      maxHeight: 200,
      margin: 40,
    });
  });

  it('escala en 1:1, 9:16 y 16:9 sin salirse del tope', () => {
    const square = autoLogoBox(1080, 1080);
    const story = autoLogoBox(1080, 1920);
    const wide = autoLogoBox(1920, 1080);
    expect(square.maxWidth).toBeLessThan(360);
    expect(story.maxWidth).toBeGreaterThan(360);
    expect(wide.maxWidth).toBeGreaterThan(360);
    expect(story.maxWidth).toBeLessThan(360 * 1.7);
    expect(square.margin).toBeGreaterThanOrEqual(12);
  });

  it('el default es automático y un layout distinto queda fijo', () => {
    const plain = resolveLayout(parseClientBrand({}), 'post_feed');
    expect(plain.logoPlacement).toBe('auto');
    expect(isCustomLogoLayout(plain.logo)).toBe(false);

    const custom = resolveLayout(
      parseClientBrand({
        layouts: {
          post_feed: {
            logo: { anchor: 'bottom-right', maxWidth: 220, maxHeight: 120, margin: 48 },
          },
        },
      }),
      'post_feed',
    );
    expect(custom.logoPlacement).toBe('fixed');
    expect(custom.logo).toMatchObject({
      anchor: 'bottom-right',
      maxWidth: 220,
      maxHeight: 120,
      margin: 48,
    });
  });
});

describe('chooseLogoPlacement', () => {
  const logo = { logoWidth: 48, logoHeight: 28, margin: 10 };

  it('no tapa una cara centrada aunque sea la zona más lisa', () => {
    const width = 240;
    const height = 300;
    const cx = 120;
    const cy = 150;
    const rx = 52;
    const ry = 68;
    const image = scene(width, height, (x, y) => {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) return [214, 156, 124];
      const n = hash(x, y);
      return [
        30 + Math.round(n * 90),
        50 + Math.round(n * 70),
        40 + Math.round((1 - n) * 50),
      ];
    });

    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      ...logo,
    });
    expect(
      hitsEllipse(
        placed.left,
        placed.top,
        logo.logoWidth,
        logo.logoHeight,
        cx,
        cy,
        rx,
        ry,
      ),
    ).toBe(false);
  });

  it('no tapa un titular aunque el papel sea la zona más calmada', () => {
    const width = 240;
    const height = 320;
    const image = scene(width, height, (x, y) => {
      if (y < 78 && x > 8 && x < 230) {
        const row = Math.floor(y / 5);
        if (row % 2 === 0) return [12, 12, 14];
        return [248, 248, 248];
      }
      const n = hash(x, y);
      return [
        40 + Math.round(n * 140),
        90 + Math.round(n * 80),
        50 + Math.round((1 - n) * 100),
      ];
    });
    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      ...logo,
    });
    expect(placed.top).toBeGreaterThanOrEqual(78);
  });

  it('esquiva un producto centrado y un patrón, y usa una zona interior', () => {
    const width = 300;
    const height = 240;
    const image = scene(width, height, (x, y) => {
      const quiet = x >= 70 && x < 155 && y >= 88 && y < 155;
      if (quiet) return [176, 188, 180];
      const n = hash(x, y);
      return n > 0.5 ? [220, 40, 50] : [30, 70, 210];
    });
    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      logoWidth: 36,
      logoHeight: 28,
      margin: 8,
    });
    const cx = placed.left + 18;
    const cy = placed.top + 14;
    expect(cx).toBeGreaterThan(70);
    expect(cx).toBeLessThan(155);
    expect(cy).toBeGreaterThan(88);
    expect(cy).toBeLessThan(155);
  });

  it('no se queda en una esquina si el sujeto ocupa las esquinas', () => {
    const width = 280;
    const height = 220;
    const image = scene(width, height, (x, y) => {
      const edgeBand = x < 70 || y < 50 || x > 210 || y > 165;
      if (!edgeBand) return [180, 190, 185];
      const n = hash(x, y);
      return [20 + Math.round(n * 180), 30 + Math.round(n * 100), 80];
    });
    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      logoWidth: 40,
      logoHeight: 24,
      margin: 8,
    });
    expect(placed.left).toBeGreaterThan(50);
    expect(placed.top).toBeGreaterThan(30);
    expect(placed.left + 40).toBeLessThan(230);
    expect(placed.top + 24).toBeLessThan(185);
  });

  it('no tapa un foco mucho más claro que el resto de la foto', () => {
    const width = 240;
    const height = 200;
    const image = scene(width, height, (x, y) => {
      const spot = x > 88 && x < 168 && y > 58 && y < 148;
      if (spot) return [252, 248, 230];
      const n = hash(x, y);
      return [22 + Math.round(n * 36), 26 + Math.round(n * 28), 32];
    });
    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      logoWidth: 36,
      logoHeight: 22,
      margin: 8,
    });
    const cx = placed.left + 18;
    const cy = placed.top + 11;
    expect(cx > 88 && cx < 168 && cy > 58 && cy < 148).toBe(false);
  });

  it('respeta el texto compuesto y cabe en 1:1, 4:5, 9:16 y 16:9', () => {
    const width = 200;
    const height = 240;
    const image = scene(width, height, (x, y) => [80 + (x % 20), 90, 110 + (y % 15)]);
    const placed = chooseLogoPlacement({
      image,
      canvasWidth: width,
      canvasHeight: height,
      logoWidth: 40,
      logoHeight: 20,
      margin: 8,
      avoid: [{ x: 10, y: 150, width: 180, height: 70 }],
    });
    expect(placed.top + 20).toBeLessThanOrEqual(150);

    const ratios = [
      [200, 200],
      [160, 200],
      [108, 192],
      [192, 108],
    ] as const;
    for (const [w, h] of ratios) {
      const photo = scene(w, h, (x, y) => [30 + (x % 40), 80 + (y % 30), 140]);
      const box = chooseLogoPlacement({
        image: photo,
        canvasWidth: w,
        canvasHeight: h,
        logoWidth: 36,
        logoHeight: 18,
        margin: 8,
      });
      expect(box.left).toBeGreaterThanOrEqual(8);
      expect(box.top).toBeGreaterThanOrEqual(8);
      expect(box.left + 36).toBeLessThanOrEqual(w);
      expect(box.top + 18).toBeLessThanOrEqual(h);
    }
  });
});
