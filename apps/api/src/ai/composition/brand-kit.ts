/**
 * Kit de marca del cliente (clients.brand): colores, fuentes, web, CTA,
 * variantes de logo y plantilla de video por defecto.
 * Todo es opcional y compatible con marcas viejas (solo logoUrl/layouts).
 */
import sharp from 'sharp';

export const AVATAR_TEMPLATES = [
  'clasica',
  'profesional',
  'circulo',
  'dividido',
] as const;
export type AvatarTemplate = (typeof AVATAR_TEMPLATES)[number];
export const DEFAULT_AVATAR_TEMPLATE: AvatarTemplate = 'profesional';

/**
 * Fuentes que el servidor trae en src/assets/fonts (OFL/Apache, peso Bold).
 * Cualquier otra fuente cae a Poppins.
 */
export const BRAND_FONTS = [
  'Poppins',
  'Montserrat',
  'Lato',
  'Inter',
  'Roboto',
  'Oswald',
  'Cinzel',
  'Playfair Display',
] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];
export const DEFAULT_BRAND_FONT: BrandFont = 'Poppins';

export type BrandColors = { dark: string; primary: string; accent: string };

export const DEFAULT_BRAND_COLORS: BrandColors = {
  dark: '#0F172A',
  primary: '#1E3A5F',
  accent: '#38BDF8',
};

export type BrandKit = {
  colors?: Partial<BrandColors>;
  fontTitle?: BrandFont;
  fontBody?: BrandFont;
  website?: string;
  ctaText?: string;
  handle?: string;
  logoDarkUrl?: string;
  logoLightUrl?: string;
  videoTemplate?: AvatarTemplate;
};

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** '#abc' / 'ABCDEF' → '#AABBCC'; inválido → undefined. */
export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = HEX.exec(value.trim());
  if (!m) return undefined;
  const hex =
    m[1]!.length === 3
      ? m[1]!
          .split('')
          .map((c) => c + c)
          .join('')
      : m[1]!;
  return `#${hex.toUpperCase()}`;
}

export function normalizeBrandFont(value: unknown): BrandFont | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  return BRAND_FONTS.find((f) => f.toLowerCase() === v);
}

export function normalizeAvatarTemplate(value: unknown): AvatarTemplate | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return AVATAR_TEMPLATES.find((t) => t === v);
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const t = cleanText(value, 2048);
  return t && /^https?:\/\//i.test(t) ? t : undefined;
}

/** Web visible en el video: sin https:// ni barra final. */
export function displayWebsite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
  return t || undefined;
}

/** Lee los campos del kit desde clients.brand (ignora lo inválido). */
export function parseBrandKit(brand: unknown): BrandKit {
  const root = isRecord(brand) ? brand : {};
  const colorsRaw = isRecord(root.colors) ? root.colors : {};
  const colors: Partial<BrandColors> = {};
  for (const key of ['dark', 'primary', 'accent'] as const) {
    const c = normalizeHexColor(colorsRaw[key]);
    if (c) colors[key] = c;
  }
  const fonts = isRecord(root.fonts) ? root.fonts : {};
  const kit: BrandKit = {};
  if (Object.keys(colors).length) kit.colors = colors;
  const fontTitle = normalizeBrandFont(fonts.title);
  const fontBody = normalizeBrandFont(fonts.body);
  if (fontTitle) kit.fontTitle = fontTitle;
  if (fontBody) kit.fontBody = fontBody;
  const website = cleanText(root.website, 120);
  if (website) kit.website = website;
  const ctaText = cleanText(root.ctaText, 60);
  if (ctaText) kit.ctaText = ctaText;
  const handle = cleanText(root.handle, 60);
  if (handle) kit.handle = handle;
  const logoDarkUrl = cleanUrl(root.logoDarkUrl);
  if (logoDarkUrl) kit.logoDarkUrl = logoDarkUrl;
  const logoLightUrl = cleanUrl(root.logoLightUrl);
  if (logoLightUrl) kit.logoLightUrl = logoLightUrl;
  const videoTemplate = normalizeAvatarTemplate(root.videoTemplate);
  if (videoTemplate) kit.videoTemplate = videoTemplate;
  return kit;
}

const KIT_TEXT_FIELDS = ['website', 'ctaText', 'handle'] as const;
const KIT_URL_FIELDS = ['logoDarkUrl', 'logoLightUrl'] as const;

/**
 * Aplica un cambio del Kit de marca sobre clients.brand sin tocar lo demás
 * (logoUrl, layouts, personaje). '' o null borra el campo.
 * Lanza Error con mensaje en español si algo no es válido.
 */
export function mergeBrandKitPatch(
  brand: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(brand) ? { ...brand } : {};
  const isClear = (v: unknown) => v === null || (typeof v === 'string' && !v.trim());

  if ('colors' in patch) {
    if (isClear(patch.colors)) delete next.colors;
    else if (isRecord(patch.colors)) {
      const prev = isRecord(next.colors) ? { ...next.colors } : {};
      for (const key of ['dark', 'primary', 'accent'] as const) {
        if (!(key in patch.colors)) continue;
        const raw = patch.colors[key];
        if (isClear(raw)) {
          delete prev[key];
          continue;
        }
        const c = normalizeHexColor(raw);
        if (!c) throw new Error(`Color "${key}" inválido: usa formato #RRGGBB`);
        prev[key] = c;
      }
      if (Object.keys(prev).length) next.colors = prev;
      else delete next.colors;
    } else throw new Error('colors debe ser un objeto { dark, primary, accent }');
  }

  if ('fonts' in patch && isRecord(patch.fonts)) {
    const prev = isRecord(next.fonts) ? { ...next.fonts } : {};
    for (const key of ['title', 'body'] as const) {
      if (!(key in patch.fonts)) continue;
      const raw = patch.fonts[key];
      if (isClear(raw)) {
        delete prev[key];
        continue;
      }
      const f = normalizeBrandFont(raw);
      if (!f)
        throw new Error(
          `Fuente no disponible: ${String(raw)}. Usa: ${BRAND_FONTS.join(', ')}`,
        );
      prev[key] = f;
    }
    if (Object.keys(prev).length) next.fonts = prev;
    else delete next.fonts;
  }

  for (const key of KIT_TEXT_FIELDS) {
    if (!(key in patch)) continue;
    const t = cleanText(patch[key], key === 'website' ? 120 : 60);
    if (t) next[key] = t;
    else delete next[key];
  }

  for (const key of KIT_URL_FIELDS) {
    if (!(key in patch)) continue;
    if (isClear(patch[key])) {
      delete next[key];
      continue;
    }
    const u = cleanUrl(patch[key]);
    if (!u) throw new Error(`${key} debe ser una URL https://`);
    next[key] = u;
  }

  if ('videoTemplate' in patch) {
    if (isClear(patch.videoTemplate)) delete next.videoTemplate;
    else {
      const t = normalizeAvatarTemplate(patch.videoTemplate);
      if (!t)
        throw new Error(`Plantilla inválida. Usa: ${AVATAR_TEMPLATES.join(', ')}`);
      next.videoTemplate = t;
    }
  }
  return next;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function darken(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  return toHex(
    ((n >> 16) & 255) * factor,
    ((n >> 8) & 255) * factor,
    (n & 255) * factor,
  );
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexLuminance(hex: string): number {
  return luminance(...hexRgb(hex));
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Mezcla hacia blanco (t=0 igual, t=1 blanco). */
function lighten(hex: string, t: number): string {
  const [r, g, b] = hexRgb(hex);
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

/**
 * Saca colores de marca del logo (solo lectura de píxeles; el logo no cambia).
 * dark = tono oscuro dominante, primary = color con más presencia,
 * accent = el color más vivo y claro. Si el logo es monocromo, usa defaults.
 */
export async function extractBrandColorsFromLogo(logo: Buffer): Promise<BrandColors> {
  const { data, info } = await sharp(logo)
    .ensureAlpha()
    .resize(64, 64, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3]!;
    if (a < 160) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  const colors = [...buckets.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .filter((c) => c.n >= 3)
    .sort((a, b) => b.n - a.n);
  if (!colors.length) return { ...DEFAULT_BRAND_COLORS };

  const notWhite = colors.filter((c) => luminance(c.r, c.g, c.b) < 235);
  const vivid = notWhite.filter(
    (c) => saturation(c.r, c.g, c.b) > 0.35 && luminance(c.r, c.g, c.b) > 40,
  );
  const darks = notWhite.filter((c) => luminance(c.r, c.g, c.b) < 70);

  const primaryC =
    vivid[0] ?? notWhite.find((c) => luminance(c.r, c.g, c.b) >= 25) ?? null;
  const accentC =
    [...vivid].sort(
      (a, b) =>
        saturation(b.r, b.g, b.b) * luminance(b.r, b.g, b.b) -
        saturation(a.r, a.g, a.b) * luminance(a.r, a.g, a.b),
    )[0] ??
    [...notWhite].sort(
      (a, b) => luminance(b.r, b.g, b.b) - luminance(a.r, a.g, a.b),
    )[0] ??
    null;

  const primary = primaryC
    ? toHex(primaryC.r, primaryC.g, primaryC.b)
    : DEFAULT_BRAND_COLORS.primary;
  const dark = darks[0]
    ? toHex(darks[0].r, darks[0].g, darks[0].b)
    : darken(primary, 0.35);
  let accent = accentC
    ? toHex(accentC.r, accentC.g, accentC.b)
    : DEFAULT_BRAND_COLORS.accent;
  if (accent === dark) accent = DEFAULT_BRAND_COLORS.accent;
  // El acento debe resaltar sobre fondo oscuro y distinguirse del primario.
  if (hexLuminance(accent) < 120 || colorDistance(accent, primary) < 60) {
    accent = lighten(
      accentC ? accent : primary,
      hexLuminance(accent) < 60 ? 0.6 : 0.45,
    );
  }
  // El fondo de las plantillas es oscuro: un "primary" muy claro lo volvería ilegible.
  const pn = parseInt(primary.slice(1), 16);
  const primaryLum = luminance((pn >> 16) & 255, (pn >> 8) & 255, pn & 255);
  return {
    dark,
    primary: primaryLum > 170 ? darken(primary, 0.55) : primary,
    accent,
  };
}

/** Colores finales: los del kit pisan a los extraídos del logo, y estos a los defaults. */
export function resolveBrandColors(
  kit: Partial<BrandColors> | undefined,
  fromLogo?: BrandColors | null,
): BrandColors {
  return {
    dark: kit?.dark ?? fromLogo?.dark ?? DEFAULT_BRAND_COLORS.dark,
    primary: kit?.primary ?? fromLogo?.primary ?? DEFAULT_BRAND_COLORS.primary,
    accent: kit?.accent ?? fromLogo?.accent ?? DEFAULT_BRAND_COLORS.accent,
  };
}
