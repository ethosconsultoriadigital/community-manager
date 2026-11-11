/**
 * Plantillas de presentación del avatar (Profesional / Círculo / Dividido).
 *
 * - Las capas fijas (fondo, marco, franjas, tarjeta final) se dibujan con sharp
 *   a partir de SVG de solo formas: no se usa texto en sharp para no depender de
 *   las fuentes del sistema.
 * - Todo el texto (título, subtítulos con palabra resaltada, web, CTA) va en un
 *   .ass que quema libass con las fuentes de src/assets/fonts.
 * - El logo se pega tal cual: solo se escala (fit inside), sin recorte, sin halo
 *   y sin cambiar sus píxeles.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  DEFAULT_BRAND_FONT,
  type AvatarTemplate,
  type BrandColors,
  type BrandFont,
} from '../composition/brand-kit';
import { fitTextLines } from '../composition/overlay-text';

export const TEMPLATE_W = 720;
export const TEMPLATE_H = 1280;
/** Tarjeta final con logo + CTA + web; solo si cabe dentro del tope de 10 s. */
export const END_CARD_SECONDS = 1.6;
export const END_CARD_MIN_SECONDS = 0.6;

/**
 * Ancho medio por letra de cada fuente, en múltiplos del tamaño ASS
 * (libass escala por usWinAscent+usWinDescent). Medido con un texto en español.
 */
const FONT_CHAR_WIDTH: Record<BrandFont, number> = {
  Poppins: 0.31,
  Montserrat: 0.36,
  Lato: 0.39,
  Inter: 0.36,
  Roboto: 0.4,
  Oswald: 0.26,
  Cinzel: 0.47,
  'Playfair Display': 0.35,
};

/** fitTextLines estima 0.55em por letra: se le pasa un ancho equivalente. */
export function equivalentWrapWidth(
  maxWidth: number,
  font: BrandFont | undefined,
): number {
  const k =
    FONT_CHAR_WIDTH[font ?? DEFAULT_BRAND_FONT] ?? FONT_CHAR_WIDTH[DEFAULT_BRAND_FONT];
  return Math.round((maxWidth * 0.55) / k);
}

export type DesignedAvatarTemplate = Exclude<AvatarTemplate, 'clasica'>;

export type Rect = { x: number; y: number; w: number; h: number };

export type AvatarTemplateInput = {
  template: DesignedAvatarTemplate;
  colors: BrandColors;
  /** Logo tal cual lo subió el cliente (se escala, nunca se recorta). */
  logo?: Buffer | null;
  title: string;
  website?: string;
  ctaText?: string;
  fontTitle?: BrandFont;
  fontBody?: BrandFont;
};

export type AvatarTemplateLayers = {
  background: Buffer;
  foreground: Buffer;
  /** Máscara (blanco = avatar visible) del tamaño de `card`. */
  mask: Buffer;
  endCard: Buffer;
  card: Rect;
  /** Círculo: el fondo es el propio avatar desenfocado bajo `background`. */
  blurBackground: boolean;
  progressBar?: { y: number; height: number; color: string };
  logoRect?: Rect;
  /** Líneas del título ya ajustadas y su tamaño (los usa el .ass). */
  titleLines: string[];
  titleSize: number;
};

export type WordCue = { word: string; start: number; end: number };

/** Carpeta de fuentes que trae el API (dist/assets/fonts o src/assets/fonts). */
export function resolveTemplateFontsDir(): string | null {
  const candidates = [
    process.env.VIDEO_FONTS_DIR?.trim(),
    join(__dirname, '..', '..', 'assets', 'fonts'),
    join(process.cwd(), 'dist', 'assets', 'fonts'),
    join(process.cwd(), 'src', 'assets', 'fonts'),
    join(process.cwd(), 'apps', 'api', 'dist', 'assets', 'fonts'),
    join(process.cwd(), 'apps', 'api', 'src', 'assets', 'fonts'),
  ].filter((v): v is string => Boolean(v));
  return candidates.find((dir) => existsSync(join(dir, 'Poppins-Bold.ttf'))) ?? null;
}

export function endCardSecondsFor(mainSeconds: number, maxSeconds: number): number {
  const room = Math.max(0, maxSeconds - mainSeconds);
  const d = Math.min(END_CARD_SECONDS, room);
  return d >= END_CARD_MIN_SECONDS ? Math.round(d * 100) / 100 : 0;
}

// ---------------------------------------------------------------- geometría

type Geometry = {
  card: Rect;
  shape: 'rounded' | 'circle' | 'square';
  radius: number;
  logoBox: Rect;
  logoAlign: 'center' | 'left';
  titleMaxW: number;
  titleSize: number;
  titleMinSize: number;
};

const GEOMETRY: Record<DesignedAvatarTemplate, Geometry> = {
  profesional: {
    card: { x: 60, y: 372, w: 600, h: 600 },
    shape: 'rounded',
    radius: 40,
    logoBox: { x: 160, y: 46, w: 400, h: 130 },
    logoAlign: 'center',
    titleMaxW: 620,
    titleSize: 56,
    titleMinSize: 44,
  },
  circulo: {
    card: { x: 110, y: 300, w: 500, h: 500 },
    shape: 'circle',
    radius: 250,
    logoBox: { x: 40, y: 48, w: 270, h: 110 },
    logoAlign: 'left',
    titleMaxW: 540,
    titleSize: 44,
    titleMinSize: 36,
  },
  dividido: {
    card: { x: 0, y: 140, w: 720, h: 720 },
    shape: 'square',
    radius: 0,
    logoBox: { x: 32, y: 18, w: 300, h: 104 },
    logoAlign: 'left',
    titleMaxW: 640,
    titleSize: 54,
    titleMinSize: 44,
  },
};

export function templateGeometry(template: DesignedAvatarTemplate): Geometry {
  return GEOMETRY[template];
}

// ---------------------------------------------------------------- capas sharp

function svg(body: string, w = TEMPLATE_W, h = TEMPLATE_H): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );
}

function gradientDef(id: string, top: string, bottom: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
}

function shadowDef(id: string, blur: number): string {
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter>`;
}

function diagonalLines(): string {
  const lines: string[] = [];
  for (let k = -TEMPLATE_H; k < TEMPLATE_W; k += 46) {
    lines.push(
      `<line x1="${k}" y1="${TEMPLATE_H}" x2="${k + TEMPLATE_H}" y2="0" stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="2"/>`,
    );
  }
  return lines.join('');
}

async function placeLogo(
  logo: Buffer | null | undefined,
  box: Rect,
  align: 'center' | 'left',
): Promise<{ input: Buffer; left: number; top: number; rect: Rect } | null> {
  if (!logo?.length) return null;
  // Solo escala proporcional: sin recorte, sin halo, píxeles intactos.
  const resized = await sharp(logo)
    .resize(box.w, box.h, { fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const w = resized.info.width;
  const h = resized.info.height;
  const left = align === 'center' ? box.x + Math.round((box.w - w) / 2) : box.x;
  const top = box.y + Math.round((box.h - h) / 2);
  return { input: resized.data, left, top, rect: { x: left, y: top, w, h } };
}

function estimatePillWidth(text: string, size: number): number {
  return Math.ceil(text.length * size * 0.56);
}

export async function renderAvatarTemplateLayers(
  input: AvatarTemplateInput,
): Promise<AvatarTemplateLayers> {
  const g = templateGeometry(input.template);
  const { dark, primary, accent } = input.colors;
  const { card } = g;
  const fitted = fitTextLines(
    input.title || '',
    equivalentWrapWidth(g.titleMaxW, input.fontTitle),
    g.titleSize,
    2,
    g.titleMinSize,
  );
  const titleLines = input.title ? fitted.lines : [];
  const titleSize = fitted.size;

  let bgSvg: string;
  let fgSvg = '';
  let blurBackground = false;
  let progressBar: AvatarTemplateLayers['progressBar'];

  if (input.template === 'profesional') {
    bgSvg =
      `<defs>${gradientDef('g', dark, primary)}<radialGradient id="glow"><stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>${shadowDef('s', 22)}</defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<circle cx="360" cy="672" r="420" fill="url(#glow)"/>` +
      diagonalLines() +
      `<rect x="${card.x}" y="${card.y + 14}" width="${card.w}" height="${card.h}" rx="${g.radius}" fill="#000" fill-opacity="0.55" filter="url(#s)"/>`;
    fgSvg =
      `<rect x="${card.x - 4}" y="${card.y - 4}" width="${card.w + 8}" height="${card.h + 8}" rx="${g.radius + 4}" fill="none" stroke="${accent}" stroke-width="4"/>` +
      `<rect x="320" y="340" width="80" height="6" rx="3" fill="${accent}"/>`;
    if (input.website) {
      const pw = estimatePillWidth(input.website, 24) + 44;
      fgSvg += `<rect x="${Math.round((TEMPLATE_W - pw) / 2)}" y="1150" width="${pw}" height="46" rx="23" fill="#000" fill-opacity="0.35" stroke="${accent}" stroke-opacity="0.8" stroke-width="2"/>`;
    }
  } else if (input.template === 'circulo') {
    blurBackground = true;
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    const bandH = Math.round(titleSize * 1.05) * Math.max(1, titleLines.length) + 36;
    bgSvg =
      `<defs>${gradientDef('g', dark, primary)}${shadowDef('s', 28)}</defs>` +
      `<rect width="100%" height="100%" fill="url(#g)" fill-opacity="0.68"/>` +
      `<circle cx="${cx}" cy="${cy + 16}" r="${card.w / 2}" fill="#000" fill-opacity="0.6" filter="url(#s)"/>`;
    fgSvg =
      `<circle cx="${cx}" cy="${cy}" r="${card.w / 2 + 12}" fill="none" stroke="${accent}" stroke-width="8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${card.w / 2 + 2}" fill="none" stroke="#FFFFFF" stroke-width="3"/>`;
    if (titleLines.length) {
      fgSvg +=
        `<rect x="60" y="836" width="600" height="${bandH}" rx="22" fill="${primary}" fill-opacity="0.92"/>` +
        `<rect x="60" y="836" width="12" height="${bandH}" fill="${accent}"/>`;
    }
  } else {
    progressBar = { y: 856, height: 8, color: accent };
    bgSvg =
      `<defs>${gradientDef('p', primary, dark)}</defs>` +
      `<rect width="100%" height="100%" fill="${dark}"/>` +
      `<rect x="0" y="860" width="${TEMPLATE_W}" height="${TEMPLATE_H - 860}" fill="url(#p)"/>`;
    const lineH = Math.round(titleSize * 1.05);
    const barY = 905 + lineH * Math.max(1, titleLines.length) + 8;
    fgSvg =
      `<rect x="0" y="0" width="${TEMPLATE_W}" height="140" fill="${dark}"/>` +
      (titleLines.length
        ? `<rect x="40" y="${barY}" width="100" height="6" rx="3" fill="${accent}"/>`
        : '');
  }

  const logoPlaced = await placeLogo(input.logo, g.logoBox, g.logoAlign);
  const background = await sharp(svg(bgSvg)).png().toBuffer();
  const fgComposites: sharp.OverlayOptions[] = [];
  if (logoPlaced)
    fgComposites.push({
      input: logoPlaced.input,
      left: logoPlaced.left,
      top: logoPlaced.top,
    });
  const foreground = await sharp(svg(fgSvg)).composite(fgComposites).png().toBuffer();

  const maskBody =
    g.shape === 'circle'
      ? `<rect width="100%" height="100%" fill="#000"/><circle cx="${card.w / 2}" cy="${card.h / 2}" r="${card.w / 2}" fill="#FFF"/>`
      : g.shape === 'rounded'
        ? `<rect width="100%" height="100%" fill="#000"/><rect width="${card.w}" height="${card.h}" rx="${g.radius}" fill="#FFF"/>`
        : `<rect width="100%" height="100%" fill="#FFF"/>`;
  const mask = await sharp(svg(maskBody, card.w, card.h))
    .flatten({ background: '#000' })
    .grayscale()
    .png()
    .toBuffer();

  // Tarjeta final: degradado de marca + logo grande + pastilla de la web.
  let endSvg = `<defs>${gradientDef('g', dark, primary)}</defs><rect width="100%" height="100%" fill="url(#g)"/>`;
  if (input.website) {
    const pw = estimatePillWidth(input.website, 28) + 52;
    endSvg += `<rect x="${Math.round((TEMPLATE_W - pw) / 2)}" y="850" width="${pw}" height="56" rx="28" fill="${accent}"/>`;
  }
  const endLogo = await placeLogo(
    input.logo,
    { x: 90, y: 380, w: 540, h: 300 },
    'center',
  );
  const endCard = await sharp(svg(endSvg))
    .composite(
      endLogo ? [{ input: endLogo.input, left: endLogo.left, top: endLogo.top }] : [],
    )
    .flatten({ background: dark })
    .png()
    .toBuffer();

  return {
    background,
    foreground,
    mask,
    endCard,
    card,
    blurBackground,
    progressBar,
    logoRect: logoPlaced?.rect,
    titleLines,
    titleSize,
  };
}

// ---------------------------------------------------------------- subtítulos ASS

/** Reparte cada línea en su ventana por largo de palabra. */
export function wordCuesFromLines(
  cues: Array<{ startSeconds: number; endSeconds: number; text: string }>,
): WordCue[][] {
  return cues
    .filter((c) => c.text.trim() && c.endSeconds > c.startSeconds)
    .map((c) => {
      const words = c.text.trim().split(/\s+/).filter(Boolean);
      const total = words.reduce((acc, w) => acc + w.length + 1, 0);
      let t = c.startSeconds;
      return words.map((word) => {
        const d = ((c.endSeconds - c.startSeconds) * (word.length + 1)) / total;
        const cue = { word, start: t, end: t + d };
        t += d;
        return cue;
      });
    })
    .filter((row) => row.length > 0);
}

/** &HAABBGGRR de ASS desde #RRGGBB (alpha 0 = opaco). */
export function assColor(hex: string, alpha = 0): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`.toUpperCase();
}

/** Texto seguro para ASS: sin llaves ni barras invertidas, una línea. */
export function escapeAssText(text: string): string {
  return text
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export type AvatarAssInput = {
  template: DesignedAvatarTemplate;
  colors: BrandColors;
  fontTitle?: BrandFont;
  fontBody?: BrandFont;
  titleLines: string[];
  titleSize: number;
  website?: string;
  ctaText?: string;
  words: WordCue[][];
  /** Segundos del avatar (sin la tarjeta final). */
  mainSeconds: number;
  endCardSeconds: number;
};

type SubStyle = {
  size: number;
  outline: number;
  marginV: number;
  upper: boolean;
  pop: number;
};

const SUB_STYLE: Record<DesignedAvatarTemplate, SubStyle> = {
  profesional: { size: 58, outline: 4, marginV: 160, upper: false, pop: 108 },
  circulo: { size: 54, outline: 5, marginV: 110, upper: true, pop: 112 },
  dividido: { size: 56, outline: 4, marginV: 100, upper: false, pop: 108 },
};

/**
 * .ass con título, web, subtítulos (palabra activa en el color de acento y un
 * poco más grande) y los textos de la tarjeta final.
 */
export function buildAvatarAss(input: AvatarAssInput): string {
  const titleFont = input.fontTitle ?? DEFAULT_BRAND_FONT;
  const bodyFont = input.fontBody ?? DEFAULT_BRAND_FONT;
  const { dark, accent } = input.colors;
  const sub = SUB_STYLE[input.template];
  const white = assColor('#FFFFFF');
  const outlineSub =
    input.template === 'circulo' ? assColor('#000000') : assColor(dark);
  const end = input.mainSeconds;
  const total = input.mainSeconds + input.endCardSeconds;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${TEMPLATE_W}`,
    `PlayResY: ${TEMPLATE_H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,${bodyFont},${sub.size},${white},${white},${outlineSub},${assColor('#000000', 0x80)},-1,0,0,0,100,100,0,0,1,${sub.outline},2,2,56,56,${sub.marginV},1`,
    `Style: Title,${titleFont},${input.titleSize},${white},${white},${assColor('#000000', 0x60)},${assColor('#000000', 0x80)},-1,0,0,0,100,100,0,0,1,0,2,8,40,40,0,1`,
    `Style: Body,${bodyFont},26,${white},${white},${assColor('#000000', 0x60)},${assColor('#000000', 0x80)},-1,0,0,0,100,100,0,0,1,0,1,5,20,20,0,1`,
    `Style: Cta,${titleFont},64,${white},${white},${assColor('#000000', 0x60)},${assColor('#000000', 0x80)},-1,0,0,0,100,100,0,0,1,0,2,8,40,40,0,1`,
    `Style: EndWeb,${bodyFont},34,${assColor(dark)},${assColor(dark)},${assColor(dark)},${assColor(dark)},-1,0,0,0,100,100,0,0,1,0,0,5,20,20,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  const ev = (style: string, s: number, e: number, text: string) => {
    if (e - s <= 0.01 || !text) return;
    events.push(`Dialogue: 0,${assTime(s)},${assTime(e)},${style},,0,0,0,,${text}`);
  };

  const title = input.titleLines.map(escapeAssText).filter(Boolean).join('\\N');
  const website = input.website ? escapeAssText(input.website) : '';
  if (input.template === 'profesional') {
    const y = input.titleLines.length >= 2 ? 200 : 226;
    ev('Title', 0, end, `{\\an8\\q2\\pos(360,${y})}${title}`);
    ev('Body', 0, end, `{\\an5\\pos(360,1173)\\fs30}${website}`);
  } else if (input.template === 'circulo') {
    const lines = Math.max(1, input.titleLines.length);
    const cy = 836 + (Math.round(input.titleSize * 1.05) * lines + 36) / 2;
    ev('Title', 0, end, `{\\an5\\q2\\pos(366,${Math.round(cy)})}${title}`);
    ev('Body', 0, end, `{\\an9\\pos(688,60)\\fs26\\1a&H20&}${website}`);
  } else {
    ev('Title', 0, end, `{\\an7\\q2\\pos(40,900)}${title}`);
    ev('Body', 0, end, `{\\an6\\pos(688,70)\\fs28\\1a&H20&}${website}`);
  }

  const hi = assColor(accent);
  for (const row of input.words) {
    const words = row.map((w) => {
      const t = escapeAssText(w.word);
      return sub.upper ? t.toLocaleUpperCase('es-MX') : t;
    });
    row.forEach((cue, i) => {
      const start = Math.min(cue.start, end);
      const stop = Math.min(
        i + 1 < row.length ? row[i + 1]!.start : cue.end + 0.15,
        end,
      );
      const text = words
        .map((w, j) =>
          j === i ? `{\\c${hi}\\fscx${sub.pop}\\fscy${sub.pop}}${w}{\\r}` : w,
        )
        .join(' ');
      ev('Sub', start, stop, text);
    });
  }

  if (input.endCardSeconds > 0) {
    const cta = escapeAssText(input.ctaText || 'Contáctanos');
    ev('Cta', end, total, `{\\an8\\pos(360,736)\\fad(250,0)}${cta}`);
    if (website)
      ev('EndWeb', end, total, `{\\an5\\pos(360,878)\\fad(250,0)}${website}`);
  }
  return `${header.join('\n')}\n${events.join('\n')}\n`;
}
