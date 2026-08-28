/** Redes disponibles hoy + las que vendrán (mismo filtro cuando existan targets). */
export const PLATFORM_FILTERS = [
  { value: 'all', label: 'Todas las redes' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'threads', label: 'Threads' },
  { value: 'tiktok', label: 'TikTok' },
] as const;

export type PlatformFilter = (typeof PLATFORM_FILTERS)[number]['value'];

export function platformFilterLabel(value: PlatformFilter): string {
  return PLATFORM_FILTERS.find((p) => p.value === value)?.label ?? value;
}

export function postMatchesPlatform(
  post: { post_targets: Array<{ social_accounts: { platform: string } }> },
  platform: PlatformFilter,
): boolean {
  if (platform === 'all') return true;
  return post.post_targets.some((t) => t.social_accounts.platform === platform);
}

/** YYYY-MM-DD en zona local del navegador. */
export function toLocalDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateKeyInRange(
  key: string | null,
  from: string,
  to: string,
): boolean {
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}
