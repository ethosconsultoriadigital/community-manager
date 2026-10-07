import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { CompositionService } from './composition.service';
import { logoPosition, parseClientBrand } from './brand-layout';

describe('brand-layout helpers', () => {
  it('garantiza layout post_feed por defecto', () => {
    const brand = parseClientBrand({});
    expect(brand.layouts.post_feed.canvas).toEqual({ width: 1080, height: 1350 });
  });

  it('calcula ancla bottom-right con margen', () => {
    const pos = logoPosition({
      canvasW: 1080,
      canvasH: 1350,
      logoW: 200,
      logoH: 80,
      anchor: 'bottom-right',
      margin: 48,
    });
    expect(pos).toEqual({ left: 1080 - 200 - 48, top: 1350 - 80 - 48 });
  });
});

describe('CompositionService', () => {
  it('produce PNG del canvas y coloca el logo sin distorsión', async () => {
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

    // Logo 160×80 nativo; max 220×120 → sin ampliación, queda 160×80
    const logo = await sharp({
      create: {
        width: 160,
        height: 80,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const clients = {
      findById: vi.fn().mockResolvedValue({
        id: 'client-1',
        brand: {
          logoUrl: 'https://storage.local/logo.png',
          layouts: {
            post_feed: {
              canvas: { width: 1080, height: 1350 },
              logo: {
                anchor: 'bottom-right',
                maxWidth: 220,
                maxHeight: 120,
                margin: 48,
              },
              text: [
                {
                  field: 'title',
                  x: 64,
                  y: 980,
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
      }),
    };

    const mediaStorage = {
      readBytesFromUrl: vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('logo')) return { buffer: logo, contentType: 'image/png' };
        return { buffer: background, contentType: 'image/png' };
      }),
    };

    const service = new CompositionService(clients as never, mediaStorage as never);
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

    // Región del logo (bottom-right): debe conservar rojo dominante sin estirar a 220×120
    const left = 1080 - 160 - 48;
    const top = 1350 - 80 - 48;
    const sample = await sharp(result.buffer)
      .extract({ left: left + 10, top: top + 10, width: 20, height: 20 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const r = sample.data[0];
    const g = sample.data[1];
    const b = sample.data[2];
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);

    // Justo fuera del logo (margen derecho) no debe ser rojo
    const outside = await sharp(result.buffer)
      .extract({ left: 1080 - 20, top: top + 10, width: 10, height: 10 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(outside.data[0]).toBeLessThan(100);
  });
});
