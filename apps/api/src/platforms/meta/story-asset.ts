/** La portada de feed usa position 0. La story vertical de AAB va aparte para no entrar al carrusel. */
export const SUPPLIED_STORY_POSITION = 100;

export function isSuppliedStoryAsset(asset: { type?: string; position?: number | null }): boolean {
  return asset.type === 'image' && (asset.position ?? 0) >= SUPPLIED_STORY_POSITION;
}

export const AAB_NO_STORY_IMAGE_MESSAGE =
  'AAB: sin url_portada_historia; no se publica historia (no se usa el banner)';

/** Quita etiquetas HTML (p. ej. <strong>) y decodifica entidades básicas. */
export function stripHtmlTags(text: string): string {
  return text
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
