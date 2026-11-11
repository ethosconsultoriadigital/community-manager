import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  cutOnWord,
  fitTextLines,
  headlineFromCaption,
  sanitizeOverlayText,
} from './overlay-text';
import { composeBrandImage, placeTextBlocks } from './compose-brand';
import { parseClientBrand, resolveLayout } from './brand-layout';
import { downsampleRgb } from './logo-placement';

describe('texto sobre la foto', () => {
  it('quita emojis, banderas, hashtags y enlaces', () => {
    expect(
      sanitizeOverlayText('¡Viva México! 🇲🇽 Hoy celebramos 🎉✨ #VivaMéxico https://x.co/a'),
    ).toBe('¡Viva México! Hoy celebramos');
    expect(sanitizeOverlayText('📊📊 ¡Más canales!')).toBe('¡Más canales!');
    expect(sanitizeOverlayText('Precio $1,200 + IVA (50%)')).toBe('Precio $1,200 + IVA (50%)');
  });

  it('usa la primera frase completa si cabe', () => {
    expect(
      headlineFromCaption(
        'Transforma tu presencia digital con Ethos Consultoría. 🚀 Ofrecemos soluciones personalizadas.',
      ),
    ).toBe('Transforma tu presencia digital con Ethos Consultoría');
    expect(headlineFromCaption('¿Tienes dudas sobre impuestos? Contáctanos')).toBe(
      '¿Tienes dudas sobre impuestos?',
    );
  });

  it('corta en palabra completa con puntos suspensivos', () => {
    const long =
      'Esta frase es demasiado larga para un título porque sigue y sigue sin ningún punto que la corte a tiempo';
    const out = headlineFromCaption(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
    const words = long.split(' ');
    for (const w of out.replace('…', '').split(' ')) expect(words).toContain(w);
    expect(cutOnWord('corto', 40)).toBe('corto');
  });

  it('ajusta a máximo de líneas bajando la letra y luego cortando', () => {
    const fit = fitTextLines('uno dos tres cuatro cinco seis siete ocho nueve diez', 300, 40, 2, 30);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.size).toBeLessThanOrEqual(40);
    const cut = fitTextLines('palabra '.repeat(40).trim(), 200, 40, 2, 40);
    expect(cut.lines.length).toBe(2);
    expect(cut.lines[1]!.endsWith('…')).toBe(true);
  });
});

async function photoWithFaceAtBottom(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const face = y > height * 0.6; // piel en todo el tercio inferior
      raw[o] = face ? 214 : 70;
      raw[o + 1] = face ? 156 : 110;
      raw[o + 2] = face ? 124 : 160;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('posición del título', () => {
  it('el título por defecto evita la piel (cara) y queda arriba', async () => {
    const bg = await photoWithFaceAtBottom(1080, 1350);
    const analysis = await downsampleRgb(bg, 1080, 1350);
    const layout = resolveLayout(parseClientBrand({}), 'post_feed');
    const blocks = placeTextBlocks({
      canvas: layout.canvas,
      textFields: layout.text,
      fields: { title: 'Titular corto de prueba' },
      image: analysis,
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.auto).toBe(true);
    expect(blocks[0]!.band.y + blocks[0]!.band.height).toBeLessThan(1350 * 0.6);
  });

  it('un layout con posición propia se respeta', async () => {
    const bg = await photoWithFaceAtBottom(1080, 1350);
    const analysis = await downsampleRgb(bg, 1080, 1350);
    const blocks = placeTextBlocks({
      canvas: { width: 1080, height: 1350 },
      textFields: [
        { field: 'title', x: 64, y: 1200, size: 48, color: '#FFFFFF', maxWidth: 900, align: 'left' },
      ],
      fields: { title: 'Fijo' },
      image: analysis,
    });
    expect(blocks[0]!.auto).toBe(false);
    expect(blocks[0]!.baselineY).toBe(1200);
  });

  it('el texto no tapa el logo fijo y el logo queda intacto', async () => {
    const bg = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 60, g: 90, b: 140 } },
    })
      .png()
      .toBuffer();
    const logo = await sharp({
      create: { width: 220, height: 120, channels: 4, background: { r: 250, g: 10, b: 10, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const brand = parseClientBrand({
      logoUrl: 'x',
      layouts: {
        post_feed: {
          canvas: { width: 1080, height: 1350 },
          logo: { anchor: 'bottom-right', margin: 48, maxWidth: 220, maxHeight: 120 },
          text: [
            { x: 64, y: 980, size: 64, color: '#FFFFFF', maxWidth: 952, align: 'left', field: 'title', font: 'bold' },
          ],
        },
      },
    });
    const out = await composeBrandImage({
      background: bg,
      logo,
      layout: resolveLayout(brand, 'post_feed'),
      fields: { title: 'Una frase bastante larga para ocupar dos líneas del título 🚀🚀' },
    });
    const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    for (const [x, y] of [
      [out.logoLeft + 2, out.logoTop + 2],
      [out.logoLeft + 110, out.logoTop + 60],
      [out.logoLeft + 217, out.logoTop + 117],
    ] as const) {
      const o = (y * info.width + x) * ch;
      expect([data[o], data[o + 1], data[o + 2]]).toEqual([250, 10, 10]);
    }
  });
});
