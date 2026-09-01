/** Chips de presets visuales para mostrar en Composer (espejo de API). */
export function visualPresetChips(platforms: string[]): string[] {
  const chips: string[] = [];
  const unique = [...new Set(platforms.map((p) => p.toLowerCase()))];
  for (const p of unique) {
    if (p === 'facebook') chips.push('Facebook: feed 1:1 o 4:5');
    else if (p === 'instagram') chips.push('Instagram: feed 1:1 (Reel = subir video 9:16)');
    else if (p === 'tiktok') chips.push('TikTok: vertical 9:16 (publicación próximamente)');
    else chips.push(`${p}: formato feed`);
  }
  return chips;
}
