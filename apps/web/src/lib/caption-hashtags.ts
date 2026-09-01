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

/** Línea compuesta solo por hashtags del set (sin texto adicional). */
export function isHashtagOnlyLine(line: string, hashtags: string[]): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('#') || !hashtagsAlreadyInText(trimmed, hashtags)) {
    return false;
  }
  let rest = trimmed;
  for (const tag of hashtags) {
    const bare = tag.trim().replace(/^#+/, '');
    if (!bare) continue;
    rest = rest.replace(new RegExp(`#${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gi'), '');
  }
  return rest.trim().length === 0;
}

/** Quita líneas que son solo hashtags; se reinsertan al final si hace falta. */
export function stripHashtagOnlyLines(text: string, hashtags: string[]): string {
  if (!hashtags?.length) return text.trim();
  const filtered = text.split('\n').filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !isHashtagOnlyLine(trimmed, hashtags);
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Si los mismos hashtags aparecen más de una vez, elimina los primeros bloques
 * y conserva el último (formato correcto al final del post).
 */
export function dedupeHashtagsKeepLast(caption: string, hashtags: string[]): string {
  if (!caption?.trim() || !hashtags?.length) return caption?.trim() ?? '';

  const lines = caption.split('\n');
  const hashtagLineIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? '';
    if (trimmed && isHashtagOnlyLine(trimmed, hashtags)) {
      hashtagLineIndices.push(i);
    }
  }

  if (hashtagLineIndices.length <= 1) return caption.trim();

  const remove = new Set(hashtagLineIndices.slice(0, -1));
  return lines
    .filter((_, i) => !remove.has(i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normaliza caption: quita hashtags intermedios duplicados y los deja al final. */
export function normalizeCaptionHashtags(caption: string, hashtags: string[]): string {
  if (!caption?.trim()) return '';
  if (!hashtags?.length) return caption.trim();

  const deduped = dedupeHashtagsKeepLast(caption, hashtags);
  const dedupedLines = deduped.split('\n');

  let lastTagLine: string | null = null;
  for (let i = dedupedLines.length - 1; i >= 0; i--) {
    const trimmed = dedupedLines[i]?.trim() ?? '';
    if (trimmed && isHashtagOnlyLine(trimmed, hashtags)) {
      lastTagLine = trimmed;
      break;
    }
  }

  const body = stripHashtagOnlyLines(deduped, hashtags);

  if (lastTagLine) {
    return [body, lastTagLine].filter(Boolean).join('\n\n').trim();
  }

  return [body, hashtags.join(' ')].filter(Boolean).join('\n\n').trim();
}

/** Hashtags visibles en UI: omitir si ya están en el caption normalizado. */
export function visibleHashtags(caption: string | null | undefined, hashtags: string[]): string[] {
  if (!hashtags?.length) return [];
  const cleaned = normalizeCaptionHashtags(caption ?? '', hashtags);
  if (hashtagsAlreadyInText(cleaned, hashtags)) return [];
  return hashtags;
}

/** Caption listo para mostrar en UI. */
export function displayCaption(caption: string | null | undefined, hashtags: string[]): string {
  return normalizeCaptionHashtags(caption?.trim() ?? '', hashtags);
}
