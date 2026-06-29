import type { Post } from '@/lib/types';

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
}: {
  post: Post;
  clientName?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
          {statusLabel(post.status)}
        </span>
        {clientName && (
          <span className="text-xs text-slate-500">{clientName}</span>
        )}
        {post.scheduled_at && (
          <span className="text-xs text-indigo-300">
            Programado: {formatDate(post.scheduled_at)}
          </span>
        )}
      </div>
      <p className="mb-2 whitespace-pre-wrap text-sm text-slate-200">
        {post.caption ?? '(sin caption)'}
      </p>
      {post.hashtags.length > 0 && (
        <p className="mb-2 text-xs text-indigo-400">{post.hashtags.join(' ')}</p>
      )}
      {post.post_targets.length > 0 ? (
        <ul className="space-y-1.5">
          {post.post_targets.map((t) => (
            <li key={t.id} className="text-xs">
              <span className="text-slate-500">
                {t.social_accounts.platform}
                {t.social_accounts.username ? ` @${t.social_accounts.username}` : ''}
              </span>
              <span className="text-slate-600"> — </span>
              <span
                className={
                  t.status === 'failed'
                    ? 'text-red-400'
                    : t.status === 'published'
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }
              >
                {targetStatusLabel(t.status)}
              </span>
              {t.platform_post_id && (
                <span className="ml-1 text-slate-600">({t.platform_post_id})</span>
              )}
              {t.error_message && (
                <p className="mt-0.5 text-red-400">{t.error_message}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Destinos: —</p>
      )}
      {children && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">{children}</div>}
    </article>
  );
}
