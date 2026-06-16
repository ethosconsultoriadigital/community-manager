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

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
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
  const targets = post.post_targets
    .map((t) => `${t.social_accounts.platform}${t.social_accounts.username ? ` @${t.social_accounts.username}` : ''}`)
    .join(', ');

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
      <p className="text-xs text-slate-500">Destinos: {targets || '—'}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">{children}</div>}
    </article>
  );
}
