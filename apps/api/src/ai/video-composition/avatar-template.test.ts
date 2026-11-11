import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BRAND_FONTS } from '../composition/brand-kit';
import {
  assColor,
  assTime,
  buildAvatarAss,
  endCardSecondsFor,
  escapeAssText,
  renderAvatarTemplateLayers,
  resolveTemplateFontsDir,
  templateGeometry,
  wordCuesFromLines,
  type DesignedAvatarTemplate,
} from './avatar-template';

const COLORS = { dark: '#060A12', primary: '#16263D', accent: '#8FB4D9' };

async function testLogo(): Promise<Buffer> {
  // Logo con detalle (degradado + franja) para detectar cualquier cambio de píxel.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="300" height="120" fill="url(#g)"/><rect x="20" y="40" width="260" height="20" fill="#00ff00"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('avatar-template', () => {
  it('trae una fuente Bold por cada fuente permitida', () => {
    const dir = resolveTemplateFontsDir();
    expect(dir).toBeTruthy();
    for (const font of BRAND_FONTS) {
      expect(existsSync(join(dir!, `${font.replace(/\s+/g, '')}-Bold.ttf`))).toBe(true);
    }
  });

  it('tarjeta final solo si cabe en el tope de 10 s', () => {
    expect(endCardSecondsFor(7.2, 10)).toBe(1.6);
    expect(endCardSecondsFor(9, 10)).toBe(1);
    expect(endCardSecondsFor(9.6, 10)).toBe(0);
    expect(endCardSecondsFor(10, 10)).toBe(0);
  });

  it('reparte palabras dentro de la ventana de cada línea', () => {
    const rows = wordCuesFromLines([
      { startSeconds: 0.1, endSeconds: 3.5, text: 'Transforma tu negocio' },
      { startSeconds: 3.6, endSeconds: 6.9, text: 'Contáctanos hoy' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((w) => w.word)).toEqual(['Transforma', 'tu', 'negocio']);
    expect(rows[0]![0]!.start).toBeCloseTo(0.1);
    expect(rows[0]![2]!.end).toBeCloseTo(3.5);
    for (const row of rows) {
      for (let i = 1; i < row.length; i++)
        expect(row[i]!.start).toBeCloseTo(row[i - 1]!.end);
    }
  });

  it('assColor y assTime', () => {
    expect(assColor('#8FB4D9')).toBe('&H00D9B48F');
    expect(assColor('#000000', 0x80)).toBe('&H80000000');
    expect(assTime(65.234)).toBe('0:01:05.23');
    expect(escapeAssText('{\\b1}hola  mundo')).toBe('b1hola mundo');
  });

  it('.ass: fuentes de marca, palabra activa en acento, título y tarjeta final', () => {
    const ass = buildAvatarAss({
      template: 'profesional',
      colors: COLORS,
      fontTitle: 'Cinzel',
      fontBody: 'Lato',
      titleLines: ['Transforma tu negocio', 'con consultoría'],
      titleSize: 56,
      website: 'ethosconsultoriadigital.com',
      ctaText: 'Agenda tu cita',
      words: wordCuesFromLines([
        { startSeconds: 0, endSeconds: 2, text: 'Hola {mundo}' },
      ]),
      mainSeconds: 7.2,
      endCardSeconds: 1.6,
    });
    expect(ass).toContain('PlayResX: 720');
    expect(ass).toContain('PlayResY: 1280');
    expect(ass).toMatch(/Style: Title,Cinzel,56,/);
    expect(ass).toMatch(/Style: Sub,Lato,/);
    expect(ass).toContain('Transforma tu negocio\\Ncon consultoría');
    // palabra activa resaltada con el acento
    expect(ass).toContain(
      `{\\c${assColor('#8FB4D9')}\\fscx108\\fscy108}Hola{\\r} mundo`,
    );
    expect(ass).not.toContain('{mundo}');
    // tarjeta final arranca al terminar el avatar
    expect(ass).toMatch(/Dialogue: 0,0:00:07\.20,0:00:08\.80,Cta,.*Agenda tu cita/);
    expect(ass).toMatch(/EndWeb,.*ethosconsultoriadigital\.com/);
    // ningún subtítulo pasa del final del avatar
    for (const line of ass.split('\n').filter((l) => l.includes(',Sub,'))) {
      const end = line.split(',')[2]!;
      expect(end <= '0:00:07.20').toBe(true);
    }
  });

  it('.ass sin tarjeta final ni web y fuente por defecto', () => {
    const ass = buildAvatarAss({
      template: 'circulo',
      colors: COLORS,
      titleLines: [],
      titleSize: 44,
      words: wordCuesFromLines([{ startSeconds: 0, endSeconds: 2, text: 'hola' }]),
      mainSeconds: 10,
      endCardSeconds: 0,
    });
    expect(ass).toMatch(/Style: Sub,Poppins,/);
    expect(ass).not.toContain(',Cta,');
    expect(ass).toContain('HOLA');
  });

  for (const template of [
    'profesional',
    'circulo',
    'dividido',
  ] as DesignedAvatarTemplate[]) {
    it(`capas ${template}: 720x1280, máscara del tamaño de la tarjeta y logo intacto`, async () => {
      const logo = await testLogo();
      const layers = await renderAvatarTemplateLayers({
        template,
        colors: COLORS,
        logo,
        title: 'Transforma tu negocio con nuestra consultoría digital',
        website: 'ethosconsultoriadigital.com',
        fontTitle: 'Cinzel',
      });
      const bg = await sharp(layers.background).metadata();
      const fg = await sharp(layers.foreground).metadata();
      const end = await sharp(layers.endCard).metadata();
      const mask = await sharp(layers.mask).metadata();
      expect([bg.width, bg.height]).toEqual([720, 1280]);
      expect([fg.width, fg.height]).toEqual([720, 1280]);
      expect([end.width, end.height]).toEqual([720, 1280]);
      expect([mask.width, mask.height]).toEqual([layers.card.w, layers.card.h]);
      expect(layers.card).toEqual(templateGeometry(template).card);
      expect(layers.titleLines.length).toBeGreaterThan(0);
      expect(layers.titleLines.length).toBeLessThanOrEqual(2);
      expect(layers.blurBackground).toBe(template === 'circulo');

      // El logo solo se escala: los píxeles del área del logo en la capa son
      // exactamente los del logo redimensionado (sin recorte, sin halo).
      const r = layers.logoRect!;
      expect(r).toBeTruthy();
      expect(r.w / r.h).toBeCloseTo(300 / 120, 1);
      const expected = await sharp(logo)
        .resize(r.w, r.h, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const actual = await sharp(layers.foreground)
        .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(actual.equals(expected)).toBe(true);
      // y no tapa la tarjeta del avatar
      const c = layers.card;
      const overlaps =
        r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y;
      expect(overlaps).toBe(false);
    });
  }

  it('sin logo también arma las capas', async () => {
    const layers = await renderAvatarTemplateLayers({
      template: 'profesional',
      colors: COLORS,
      logo: null,
      title: '',
    });
    expect(layers.logoRect).toBeUndefined();
    expect(layers.titleLines).toEqual([]);
  });
});
