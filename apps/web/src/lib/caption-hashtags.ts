/** Indica si todos los hashtags ya aparecen en el texto (p. ej. copy de Radar). */
export function hashtagsAlreadyInText(text: string, hashtags: string[]): boolean {
  if (!hashtags?.length || !text?.trim()) return false;
  const haystack = text.toLowerCase();
  return hashtags.every((tag) => {
    const bare = tag.trim().replace(/^#+/, '').toLowerCase();
    if (!bare) return true;
    return haystack.includes(`#${bare}`);
  });
}

/** Quita una línea final de hashtags si ya aparecen antes en el caption. */
export function stripTrailingDuplicateHashtags(caption: string, hashtags: string[]): string {
  if (!caption?.trim() || !hashtags?.length) return caption?.trim() ?? '';

  const lines = caption.trimEnd().split('\n');
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx]?.trim()) lastIdx -= 1;
  if (lastIdx < 0) return caption.trim();

  const lastLine = lines[lastIdx]!.trim();
  if (!lastLine.includes('#') || !hashtagsAlreadyInText(lastLine, hashtags)) {
    return caption.trim();
  }

  const body = lines.slice(0, lastIdx).join('\n');
  if (!hashtagsAlreadyInText(body, hashtags)) {
    return caption.trim();
  }

  return body.replace(/\n+$/, '').trim();
}

/** Hashtags visibles en UI: omitir si ya están en el caption. */
export function visibleHashtags(caption: string | null | undefined, hashtags: string[]): string[] {
  if (!hashtags?.length) return [];
  const cleaned = stripTrailingDuplicateHashtags(caption ?? '', hashtags);
  if (hashtagsAlreadyInText(cleaned, hashtags)) return [];
  return hashtags;
}

/** Caption listo para mostrar en UI sin bloque final duplicado. */
export function displayCaption(caption: string | null | undefined, hashtags: string[]): string {
  return stripTrailingDuplicateHashtags(caption?.trim() ?? '', hashtags);
}
