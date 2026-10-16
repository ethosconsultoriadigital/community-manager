/**
 * Layout de marca en clients.brand (jsonb).
 * Validación ligera sin zod (evitar dependencia nueva).
 */

export type LogoAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

export type BrandTextAlign = 'left' | 'center' | 'right';

export type BrandLogoLayout = {
  anchor: LogoAnchor;
  maxWidth: number;
  maxHeight: number;
  margin: number;
};

export type BrandTextField = {
  field: string;
  x: number;
  y: number;
  size: number;
  color: string;
  maxWidth: number;
  align: BrandTextAlign;
  font?: string;
};

export type BrandLayout = {
  canvas: { width: number; height: number };
  logo: BrandLogoLayout;
  text: BrandTextField[];
};

export type ClientBrandConfig = {
  logoUrl?: string;
  /** Imagen del personaje estilizado (avatar / “robocito”). */
  characterImageUrl?: string;
  /** Voice ID de ElevenLabs (opcional). */
  ttsVoiceId?: string;
  fonts?: Record<string, string>;
  layouts: Record<string, BrandLayout>;
};

export const DEFAULT_LAYOUT_KEY = 'post_feed';

export const DEFAULT_POST_FEED_LAYOUT: BrandLayout = {
  canvas: { width: 1080, height: 1350 },
  logo: {
    anchor: 'top-left',
    maxWidth: 360,
    maxHeight: 200,
    margin: 40,
  },
  text: [
    {
      field: 'title',
      x: 64,
      y: 980,
      size: 64,
      color: '#FFFFFF',
      maxWidth: 952,
      align: 'left',
      font: 'bold',
    },
  ],
};

const ANCHORS = new Set<LogoAnchor>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function parseLogo(raw: unknown): BrandLogoLayout {
  const d = DEFAULT_POST_FEED_LAYOUT.logo;
  if (!isRecord(raw)) return { ...d };
  const anchor = String(raw.anchor ?? d.anchor) as LogoAnchor;
  return {
    anchor: ANCHORS.has(anchor) ? anchor : d.anchor,
    maxWidth: positiveInt(raw.maxWidth, d.maxWidth),
    maxHeight: positiveInt(raw.maxHeight, d.maxHeight),
    margin: positiveInt(raw.margin, d.margin),
  };
}

function parseTextField(raw: unknown): BrandTextField | null {
  if (!isRecord(raw)) return null;
  const field = typeof raw.field === 'string' ? raw.field.trim() : '';
  if (!field) return null;
  const alignRaw = String(raw.align ?? 'left');
  const align: BrandTextAlign =
    alignRaw === 'center' || alignRaw === 'right' ? alignRaw : 'left';
  return {
    field,
    x: positiveInt(raw.x, 64),
    y: positiveInt(raw.y, 980),
    size: positiveInt(raw.size, 64),
    color:
      typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : '#FFFFFF',
    maxWidth: positiveInt(raw.maxWidth, 952),
    align,
    font: typeof raw.font === 'string' ? raw.font : undefined,
  };
}

function parseLayout(raw: unknown): BrandLayout {
  const d = DEFAULT_POST_FEED_LAYOUT;
  if (!isRecord(raw)) {
    return {
      canvas: { ...d.canvas },
      logo: { ...d.logo },
      text: d.text.map((t) => ({ ...t })),
    };
  }
  const canvasRaw = isRecord(raw.canvas) ? raw.canvas : {};
  const textRaw = Array.isArray(raw.text) ? raw.text : d.text;
  const text = textRaw
    .map(parseTextField)
    .filter((t): t is BrandTextField => t !== null);
  return {
    canvas: {
      width: positiveInt(canvasRaw.width, d.canvas.width),
      height: positiveInt(canvasRaw.height, d.canvas.height),
    },
    logo: parseLogo(raw.logo),
    text: text.length ? text : d.text.map((t) => ({ ...t })),
  };
}

/** Parsea clients.brand; siempre garantiza al menos post_feed. */
export function parseClientBrand(brand: unknown): ClientBrandConfig {
  const root = isRecord(brand) ? brand : {};
  const logoUrl =
    typeof root.logoUrl === 'string' && root.logoUrl.trim()
      ? root.logoUrl.trim()
      : undefined;
  const characterImageUrl =
    typeof root.characterImageUrl === 'string' && root.characterImageUrl.trim()
      ? root.characterImageUrl.trim()
      : undefined;
  const ttsVoiceId =
    typeof root.ttsVoiceId === 'string' && root.ttsVoiceId.trim()
      ? root.ttsVoiceId.trim()
      : undefined;

  const fonts = isRecord(root.fonts)
    ? Object.fromEntries(
        Object.entries(root.fonts).filter(
          (e): e is [string, string] => typeof e[1] === 'string',
        ),
      )
    : undefined;

  const layoutsRaw = isRecord(root.layouts) ? root.layouts : {};
  const layouts: Record<string, BrandLayout> = {};
  for (const [key, value] of Object.entries(layoutsRaw)) {
    layouts[key] = parseLayout(value);
  }
  if (!layouts[DEFAULT_LAYOUT_KEY]) {
    layouts[DEFAULT_LAYOUT_KEY] = {
      canvas: { ...DEFAULT_POST_FEED_LAYOUT.canvas },
      logo: { ...DEFAULT_POST_FEED_LAYOUT.logo },
      text: DEFAULT_POST_FEED_LAYOUT.text.map((t) => ({ ...t })),
    };
  }

  return { logoUrl, characterImageUrl, ttsVoiceId, fonts, layouts };
}

export type ResolvedBrandLayout = BrandLayout & {
  /**
   * auto: el bloque de logo coincide con el default (también el que se guarda al
   * subir un logo). fixed: ancla, tamaño o margen distintos de ese default.
   */
  logoPlacement: 'auto' | 'fixed';
};

/** El default top-left 360×200 margen 40 no cuenta como posición elegida. */
export function isCustomLogoLayout(logo: BrandLogoLayout): boolean {
  const d = DEFAULT_POST_FEED_LAYOUT.logo;
  return (
    logo.anchor !== d.anchor ||
    logo.maxWidth !== d.maxWidth ||
    logo.maxHeight !== d.maxHeight ||
    logo.margin !== d.margin
  );
}

/**
 * Tamaño del logo respecto al lienzo. En 1080×1350 coincide con el default
 * (360×200, margen 40). En otros formatos escala con la diagonal, con tope.
 */
export function autoLogoBox(
  canvasWidth: number,
  canvasHeight: number,
): BrandLogoLayout {
  const d = DEFAULT_POST_FEED_LAYOUT;
  const scaleRaw = Math.sqrt(
    (canvasWidth / d.canvas.width) * (canvasHeight / d.canvas.height),
  );
  const scale = Math.min(1.65, Math.max(0.55, scaleRaw));
  return {
    anchor: d.logo.anchor,
    maxWidth: Math.max(48, Math.round(d.logo.maxWidth * scale)),
    maxHeight: Math.max(32, Math.round(d.logo.maxHeight * scale)),
    margin: Math.max(12, Math.round(d.logo.margin * scale)),
  };
}

export function resolveLayout(
  brand: ClientBrandConfig,
  layoutKey: string,
): ResolvedBrandLayout {
  const base = brand.layouts[layoutKey] ?? brand.layouts[DEFAULT_LAYOUT_KEY]!;
  const custom = isCustomLogoLayout(base.logo);
  return {
    canvas: { ...base.canvas },
    logo: custom ? { ...base.logo } : { ...DEFAULT_POST_FEED_LAYOUT.logo },
    text: base.text.map((t) => ({ ...t })),
    logoPlacement: custom ? 'fixed' : 'auto',
  };
}

export function logoPosition(input: {
  canvasW: number;
  canvasH: number;
  logoW: number;
  logoH: number;
  anchor: LogoAnchor;
  margin: number;
}): { left: number; top: number } {
  const { canvasW, canvasH, logoW, logoH, anchor, margin } = input;
  switch (anchor) {
    case 'top-left':
      return { left: margin, top: margin };
    case 'top-right':
      return { left: Math.max(0, canvasW - logoW - margin), top: margin };
    case 'bottom-left':
      return { left: margin, top: Math.max(0, canvasH - logoH - margin) };
    case 'center':
      return {
        left: Math.max(0, Math.round((canvasW - logoW) / 2)),
        top: Math.max(0, Math.round((canvasH - logoH) / 2)),
      };
    case 'bottom-right':
    default:
      return {
        left: Math.max(0, canvasW - logoW - margin),
        top: Math.max(0, canvasH - logoH - margin),
      };
  }
}
