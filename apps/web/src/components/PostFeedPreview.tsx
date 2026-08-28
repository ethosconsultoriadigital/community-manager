import type { MediaAsset, Post } from '@/lib/types';

function sortedMedia(assets: MediaAsset[] | undefined): MediaAsset[] {
  if (!assets?.length) return [];
  return [...assets].sort((a, b) => a.position - b.position);
}

function platformLabel(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes('instagram')) return 'Instagram';
  if (p.includes('facebook')) return 'Facebook';
  return platform;
}

export function PostFeedPreview({
  post,
  clientName,
}: {
  post: Post;
  clientName?: string;
}) {
  const media = sortedMedia(post.media_assets);
  const primary = media[0];
  const pageName =
    clientName ??
    post.post_targets[0]?.social_accounts.username ??
    'Página';
  const initial = pageName.trim().charAt(0).toUpperCase() || '?';
  const platforms = [
    ...new Set(
      post.post_targets.map((t) => platformLabel(t.social_accounts.platform)),
    ),
  ];
  const isReel = post.video_format === 'reel' || primary?.type === 'video';

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{pageName}</p>
          <p className="truncate text-xs text-muted">
            {platforms.length > 0 ? platforms.join(' · ') : 'Sin destino'}
            {isReel && primary?.type === 'video' ? ' · Reel / video' : ''}
            <span className="text-line-strong"> · </span>
            Vista previa
          </p>
        </div>
      </div>

      {primary ? (
        <div className="relative bg-black/5">
          {primary.type === 'video' ? (
            <video
              src={primary.storage_url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[420px] w-full bg-black object-contain"
            >
              Tu navegador no reproduce este video.
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URLs dinámicas de R2/media
            <img
              src={primary.storage_url}
              alt="Vista previa de la publicación"
              className="max-h-[420px] w-full object-contain"
            />
          )}
          {media.length > 1 && (
            <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
              +{media.length - 1} más
            </span>
          )}
          {post.video_format === 'reel' && (
            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
              Reel
            </span>
          )}
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center bg-canvas px-4 text-center text-sm text-muted">
          Sin media adjunta (solo texto)
        </div>
      )}

      {media.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-line bg-canvas px-2 py-2">
          {media.map((asset, i) => (
            <a
              key={asset.id}
              href={asset.storage_url}
              target="_blank"
              rel="noreferrer"
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-line bg-white"
              title={i === 0 ? 'Principal' : `Media ${i + 1}`}
            >
              {asset.type === 'video' ? (
                <video
                  src={asset.storage_url}
                  muted
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.storage_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </a>
          ))}
        </div>
      )}

      <div className="space-y-1.5 px-3 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {post.caption?.trim() ? post.caption : '(sin caption)'}
        </p>
        {post.hashtags.length > 0 && (
          <p className="text-sm text-brand">{post.hashtags.join(' ')}</p>
        )}
      </div>
    </div>
  );
}
