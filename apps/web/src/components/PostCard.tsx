import type { Post } from '@/lib/types';
import { displayCaption, visibleHashtags } from '@/lib/caption-hashtags';
import { PostFeedPreview } from '@/components/PostFeedPreview';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente',
  approved: 'Aprobado',
  scheduled: 'Programado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Fallido',
  archived: 'Archivado',
};

const TARGET_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Fallido',
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function targetStatusLabel(status: string) {
  return TARGET_STATUS_LABELS[status] ?? status;
}

export function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PostCard({
  post,
  clientName,
  children,
  showPreview = true,
}: {
  post: Post;
  clientName?: string;
  children?: React.ReactNode;
  /** Vista previa visual (media + texto). Por defecto activa. */
  showPreview?: boolean;
}) {
  const displayHashtags = visibleHashtags(post.caption, post.hashtags);
  const captionText = displayCaption(post.caption, post.hashtags);

  return (
    <article className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
          {statusLabel(post.status)}
        </span>
        {clientName && <span className="text-xs text-muted">{clientName}</span>}
        {post.scheduled_at && (
          <span className="text-xs font-medium text-brand">
            Programado: {formatDate(post.scheduled_at)}
          </span>
        )}
        {post.also_publish_as_story && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
            + Story
          </span>
        )}
      </div>

      {showPreview ? (
        <div className="mb-3">
          <PostFeedPreview post={post} clientName={clientName} />
        </div>
      ) : (
        <>
          <p className="mb-2 whitespace-pre-wrap text-sm text-ink">
            {captionText || '(sin caption)'}
          </p>
          {displayHashtags.length > 0 && (
            <p className="mb-2 text-xs text-brand">{displayHashtags.join(' ')}</p>
          )}
        </>
      )}

      {post.post_targets.length > 0 ? (
        <ul className="space-y-1.5">
          {post.post_targets.map((t) => (
            <li key={t.id} className="text-xs">
              <span className="text-muted">
                {t.social_accounts.platform}
                {t.social_accounts.username ? ` @${t.social_accounts.username}` : ''}
              </span>
              <span className="text-line-strong"> — </span>
              <span
                className={
                  t.status === 'failed'
                    ? 'text-red-600'
                    : t.status === 'published'
                      ? 'text-emerald-600'
                      : 'text-muted'
                }
              >
                {targetStatusLabel(t.status)}
              </span>
              {t.platform_post_id && (
                <span className="ml-1 text-muted">({t.platform_post_id})</span>
              )}
              {t.error_message && (
                <p className="mt-0.5 text-red-600">{t.error_message}</p>
              )}
              {t.story_status && t.story_status !== 'published' && (
                <p
                  className={`mt-0.5 ${
                    t.story_status === 'failed' ? 'text-amber-700' : 'text-muted'
                  }`}
                >
                  Story: {t.story_status}
                  {t.story_error_message ? ` — ${t.story_error_message}` : ''}
                </p>
              )}
              {t.story_status === 'published' && (
                <p className="mt-0.5 text-emerald-600">Story publicada</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Destinos: —</p>
      )}
      {children && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{children}</div>
      )}
    </article>
  );
}
