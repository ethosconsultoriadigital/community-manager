/**
 * Opciones del Kit de marca (deben coincidir con apps/api/src/ai/composition/brand-kit.ts).
 */
export const AVATAR_TEMPLATE_OPTIONS = [
  {
    value: 'profesional',
    label: 'Profesional',
    hint: 'Tarjeta con marco, título y web',
  },
  {
    value: 'circulo',
    label: 'Círculo',
    hint: 'Avatar en círculo sobre fondo desenfocado',
  },
  { value: 'dividido', label: 'Dividido', hint: 'Avatar arriba, panel de marca abajo' },
  { value: 'clasica', label: 'Clásica', hint: 'Como antes: avatar con subtítulos' },
] as const;

export type AvatarTemplateValue = (typeof AVATAR_TEMPLATE_OPTIONS)[number]['value'];

export const DEFAULT_AVATAR_TEMPLATE: AvatarTemplateValue = 'profesional';

export const BRAND_FONT_OPTIONS = [
  'Poppins',
  'Montserrat',
  'Lato',
  'Inter',
  'Roboto',
  'Oswald',
  'Cinzel',
  'Playfair Display',
] as const;

export function readVideoTemplate(
  brand: Record<string, unknown> | null | undefined,
): AvatarTemplateValue {
  const raw = typeof brand?.videoTemplate === 'string' ? brand.videoTemplate : '';
  const found = AVATAR_TEMPLATE_OPTIONS.find((o) => o.value === raw);
  return found ? found.value : DEFAULT_AVATAR_TEMPLATE;
}
