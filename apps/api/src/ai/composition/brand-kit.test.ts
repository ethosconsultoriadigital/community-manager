import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_COLORS,
  displayWebsite,
  extractBrandColorsFromLogo,
  mergeBrandKitPatch,
  normalizeAvatarTemplate,
  normalizeBrandFont,
  normalizeHexColor,
  parseBrandKit,
  resolveBrandColors,
} from './brand-kit';
import { parseClientBrand } from './brand-layout';

describe('brand-kit', () => {
  it('normaliza colores, fuentes y plantillas', () => {
    expect(normalizeHexColor('#8fb4d9')).toBe('#8FB4D9');
    expect(normalizeHexColor('abc')).toBe('#AABBCC');
    expect(normalizeHexColor('rojo')).toBeUndefined();
    expect(normalizeBrandFont('cinzel')).toBe('Cinzel');
    expect(normalizeBrandFont('Comic Sans')).toBeUndefined();
    expect(normalizeAvatarTemplate('Clásica')).toBe('clasica');
    expect(normalizeAvatarTemplate('Profesional')).toBe('profesional');
    expect(normalizeAvatarTemplate('otra')).toBeUndefined();
    expect(displayWebsite('https://www.ethosconsultoriadigital.com/')).toBe(
      'ethosconsultoriadigital.com',
    );
  });

  it('una marca vieja (solo logo/layouts) no gana campos nuevos', () => {
    const old = { logoUrl: 'https://cdn/logo.png', layouts: {} };
    expect(parseBrandKit(old)).toEqual({});
    const parsed = parseClientBrand(old);
    expect(parsed.logoUrl).toBe('https://cdn/logo.png');
    expect(parsed.colors).toBeUndefined();
    expect(parsed.videoTemplate).toBeUndefined();
  });

  it('parseClientBrand lee el kit y descarta lo inválido', () => {
    const parsed = parseClientBrand({
      logoUrl: 'https://cdn/logo.png',
      colors: { dark: '#060a12', primary: '#16263D', accent: 'azul' },
      fonts: { title: 'Cinzel', body: 'Papyrus' },
      website: ' ethosconsultoriadigital.com ',
      ctaText: 'Agenda tu cita',
      videoTemplate: 'circulo',
      logoDarkUrl: 'javascript:alert(1)',
    });
    expect(parsed.colors).toEqual({ dark: '#060A12', primary: '#16263D' });
    expect(parsed.fontTitle).toBe('Cinzel');
    expect(parsed.fontBody).toBeUndefined();
    expect(parsed.website).toBe('ethosconsultoriadigital.com');
    expect(parsed.ctaText).toBe('Agenda tu cita');
    expect(parsed.videoTemplate).toBe('circulo');
    expect(parsed.logoDarkUrl).toBeUndefined();
    expect(parsed.fonts).toEqual({ title: 'Cinzel', body: 'Papyrus' });
  });

  it('mergeBrandKitPatch solo toca campos del kit', () => {
    const brand = {
      logoUrl: 'https://cdn/logo.png',
      characterImageUrl: 'https://cdn/char.png',
      layouts: { post_feed: { logo: { anchor: 'bottom-right' } } },
      fonts: { title: 'Lato' },
      website: 'viejo.com',
    };
    const next = mergeBrandKitPatch(brand, {
      colors: { dark: '#000', accent: '#8FB4D9' },
      fonts: { body: 'Montserrat' },
      website: '',
      ctaText: 'Escríbenos',
      videoTemplate: 'Dividido',
      logoDarkUrl: 'https://cdn/logo-dark.png',
    });
    expect(next.logoUrl).toBe(brand.logoUrl);
    expect(next.characterImageUrl).toBe(brand.characterImageUrl);
    expect(next.layouts).toEqual(brand.layouts);
    expect(next.colors).toEqual({ dark: '#000000', accent: '#8FB4D9' });
    expect(next.fonts).toEqual({ title: 'Lato', body: 'Montserrat' });
    expect(next.website).toBeUndefined();
    expect(next.ctaText).toBe('Escríbenos');
    expect(next.videoTemplate).toBe('dividido');
    expect(next.logoDarkUrl).toBe('https://cdn/logo-dark.png');
    // no muta el original
    expect(brand.website).toBe('viejo.com');
  });

  it('mergeBrandKitPatch rechaza valores inválidos con mensaje en español', () => {
    expect(() => mergeBrandKitPatch({}, { colors: { dark: 'negro' } })).toThrow(
      /Color/,
    );
    expect(() => mergeBrandKitPatch({}, { fonts: { title: 'Comic Sans' } })).toThrow(
      /Fuente/,
    );
    expect(() => mergeBrandKitPatch({}, { videoTemplate: 'x' })).toThrow(/Plantilla/);
    expect(() => mergeBrandKitPatch({}, { logoDarkUrl: 'ftp://x' })).toThrow(/URL/);
  });

  it('extrae colores de un logo azul marino + azul claro', async () => {
    const logo = await sharp({
      create: { width: 200, height: 100, channels: 4, background: '#0E1F31' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 100, height: 100, channels: 4, background: '#0092CF' },
          })
            .png()
            .toBuffer(),
          left: 100,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const colors = await extractBrandColorsFromLogo(logo);
    expect(colors.dark).toMatch(/^#[0-9A-F]{6}$/);
    expect(colors.primary).not.toBe(colors.dark);
    expect(colors.accent).not.toBe(colors.primary);
  });

  it('logo totalmente transparente → colores por defecto', async () => {
    const logo = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    expect(await extractBrandColorsFromLogo(logo)).toEqual(DEFAULT_BRAND_COLORS);
  });

  it('resolveBrandColors: kit > logo > defaults', () => {
    expect(
      resolveBrandColors(
        { accent: '#FF0000' },
        { dark: '#000001', primary: '#000002', accent: '#000003' },
      ),
    ).toEqual({ dark: '#000001', primary: '#000002', accent: '#FF0000' });
    expect(resolveBrandColors(undefined, null)).toEqual(DEFAULT_BRAND_COLORS);
  });
});
