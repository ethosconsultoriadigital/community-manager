import Link from 'next/link';
import type { Post } from '@/lib/types';

export type DashboardCardTone = 'pending' | 'approved' | 'scheduled' | 'published' | 'metric';

const TONE_STYLES: Record<
  DashboardCardTone,
  { border: string; bg: string; accent: string; badge: string }
> = {
  pending: {
    border: 'border-amber-200',
    bg: 'from-amber-50 to-surface',
    accent: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
  },
  approved: {
    border: 'border-sky-200',
    bg: 'from-sky-50 to-surface',
    accent: 'text-sky-700',
    badge: 'bg-sky-100 text-sky-800',
  },
  scheduled: {
    border: 'border-violet-200',
    bg: 'from-violet-50 to-surface',
    accent: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-800',
  },
  published: {
    border: 'border-emerald-200',
    bg: 'from-emerald-50 to-surface',
    accent: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  metric: {
    border: 'border-line',
    bg: 'from-canvas to-surface',
    accent: 'text-brand',
    badge: 'bg-brand/10 text-brand',
  },
};

function previewUrlsFromPosts(posts: Post[], limit = 4): string[] {
  const urls: string[] = [];
  for (const post of posts) {
    const media = [...(post.media_assets ?? [])].sort((a, b) => a.position - b.position)[0];
    if (media?.storage_url) urls.push(media.storage_url);
    if (urls.length >= limit) break;
  }
  return urls;
}

function captionInitial(caption: string | null | undefined) {
  const c = caption?.trim();
  return c ? c.charAt(0).toUpperCase() : '?';
}

function MediaCollage({
  previews,
  fallbackInitial,
  tone,
}: {
  previews: string[];
  fallbackInitial: string;
  tone: DashboardCardTone;
}) {
  const slots = previews.length > 0 ? previews.slice(0, 4) : [];
  const emptySlots = Math.max(0, 4 - slots.length);

  return (
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-md border border-line/60 bg-white/80 p-1">
      {slots.map((url, i) => (
        <div key={`${url}-${i}`} className="relative aspect-square overflow-hidden rounded-sm bg-canvas">
          {url.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
            <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ))}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className={`flex aspect-square items-center justify-center rounded-sm bg-gradient-to-br ${TONE_STYLES[tone].bg}`}
        >
          {i === 0 && slots.length === 0 ? (
            <span className={`text-lg font-semibold ${TONE_STYLES[tone].accent}`}>{fallbackInitial}</span>
          ) : (
            <span className="text-[10px] text-muted">—</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DashboardStatCard({
  label,
  value,
  href,
  tone,
  posts = [],
  previewPosts,
  subtitle,
  formatValue,
}: {
  label: string;
  value: number;
  href?: string;
  tone: DashboardCardTone;
  posts?: Post[];
  /** Posts concretos para el collage (si no se pasan, se usa `posts`). */
  previewPosts?: Post[];
  subtitle?: string;
  formatValue?: (n: number) => string;
}) {
  const styles = TONE_STYLES[tone];
  const source = previewPosts ?? posts;
  const previews = previewUrlsFromPosts(source);
  const fallbackInitial = captionInitial(source[0]?.caption);
  const displayValue = formatValue ? formatValue(value) : value.toLocaleString();

  const inner = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className={`text-3xl font-bold ${styles.accent}`}>{displayValue}</p>
          <p className="mt-0.5 text-xs font-medium text-ink">{label}</p>
          {subtitle && <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${styles.badge}`}>
          {source.length > 0 ? `${Math.min(source.length, 4)}+` : '0'}
        </span>
      </div>
      <MediaCollage previews={previews} fallbackInitial={fallbackInitial} tone={tone} />
    </>
  );

  const className = `block overflow-hidden rounded-xl border ${styles.border} bg-gradient-to-br ${styles.bg} p-4 shadow-sm transition-all hover:border-brand hover:shadow-md`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <article className={className}>{inner}</article>;
}

export function postsForStatus(posts: Post[], status: string): Post[] {
  return posts
    .filter((p) => p.status === status)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}
