'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { PostCard, formatDate, statusLabel } from '@/components/PostCard';
import { paginate } from '@/lib/pagination';
import {
  PLATFORM_FILTERS,
  isDateKeyInRange,
  platformFilterLabel,
  postMatchesPlatform,
  toLocalDateKey,
  type PlatformFilter,
} from '@/lib/platform-filters';
import type { Client, Post } from '@/lib/types';

function postDateKey(post: Post): string | null {
  if (post.status === 'published') {
    return toLocalDateKey(post.published_at ?? post.updated_at);
  }
  if (post.scheduled_at) return toLocalDateKey(post.scheduled_at);
  return toLocalDateKey(post.updated_at);
}

function CompactPostTile({
  post,
  clientName,
  onOpen,
}: {
  post: Post;
  clientName?: string;
  onOpen: () => void;
}) {
  const media = [...(post.media_assets ?? [])].sort((a, b) => a.position - b.position)[0];
  const platform =
    post.post_targets.map((t) => t.social_accounts.platform).filter(Boolean).join(', ') ||
    '—';
  const when =
    post.status === 'published'
      ? formatDate(post.published_at)
      : formatDate(post.scheduled_at);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <div className="relative aspect-square bg-canvas">
        {media?.type === 'video' ? (
          <video
            src={media.storage_url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : media ? (
          <img
            src={media.storage_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
            Sin media
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
          {platform}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
            {statusLabel(post.status)}
          </span>
          {clientName && (
            <span className="truncate text-[10px] text-muted">{clientName}</span>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-ink">
          {post.caption?.trim() || '(sin caption)'}
        </p>
        <p className="text-[10px] text-muted">{when}</p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-auto rounded-md border border-line-strong bg-white px-2 py-1.5 text-xs font-medium text-ink hover:bg-canvas"
        >
          Ver post
        </button>
      </div>
    </article>
  );
}

function PostGridSection({
  title,
  titleClassName,
  posts,
  clients,
  page,
  onPageChange,
  label,
  emptyText,
  onOpen,
}: {
  title: string;
  titleClassName?: string;
  posts: Post[];
  clients: Record<string, string>;
  page: number;
  onPageChange: (p: number) => void;
  label: string;
  emptyText: string;
  onOpen: (post: Post) => void;
}) {
  const paginated = useMemo(() => paginate(posts, page, 12), [posts, page]);

  useEffect(() => {
    if (page > paginated.totalPages) onPageChange(paginated.safePage);
  }, [page, paginated.totalPages, paginated.safePage, onPageChange]);

  return (
    <section className="space-y-3">
      <h2 className={titleClassName ?? 'text-sm font-medium text-muted'}>
        {title} ({posts.length})
      </h2>
      {posts.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {paginated.slice.map((post) => (
              <CompactPostTile
                key={post.id}
                post={post}
                clientName={clients[post.client_id]}
                onOpen={() => onOpen(post)}
              />
            ))}
          </div>
          <Pagination
            page={paginated.safePage}
            totalPages={paginated.totalPages}
            totalItems={paginated.totalItems}
            onPageChange={onPageChange}
            label={label}
          />
        </>
      )}
    </section>
  );
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [scheduledPage, setScheduledPage] = useState(1);
  const [publishedPage, setPublishedPage] = useState(1);
  const [failedPage, setFailedPage] = useState(1);
  const [detailPost, setDetailPost] = useState<Post | null>(null);

  const load = useCallback(async () => {
    const [postsData, clientsData] = await Promise.all([
      apiFetch<Post[]>('/posts'),
      apiFetch<Client[]>('/clients'),
    ]);
    setPosts(postsData);
    setClients(Object.fromEntries(clientsData.map((c) => [c.id, c.name])));
  }, []);

  useEffect(() => {
    load()
      .catch(() => setError('No se pudieron cargar los posts'))
      .finally(() => setLoading(false));
  }, [load]);

  const matchesFilters = useCallback(
    (post: Post) => {
      if (!postMatchesPlatform(post, platformFilter)) return false;
      if (!dateFrom && !dateTo) return true;
      return isDateKeyInRange(postDateKey(post), dateFrom, dateTo);
    },
    [platformFilter, dateFrom, dateTo],
  );

  const scheduled = useMemo(
    () =>
      posts
        .filter((p) => p.status === 'scheduled' && p.scheduled_at && matchesFilters(p))
        .sort(
          (a, b) =>
            new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime(),
        ),
    [posts, matchesFilters],
  );

  const published = useMemo(
    () =>
      posts
        .filter((p) => p.status === 'published' && matchesFilters(p))
        .sort(
          (a, b) =>
            new Date(b.published_at ?? b.updated_at).getTime() -
            new Date(a.published_at ?? a.updated_at).getTime(),
        ),
    [posts, matchesFilters],
  );

  const failed = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            (p.status === 'failed' || p.status === 'publishing') && matchesFilters(p),
        )
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
    [posts, matchesFilters],
  );

  const daySummary = useMemo(() => {
    const day = dateFrom && dateFrom === dateTo ? dateFrom : dateFrom || dateTo;
    if (!day || (dateFrom && dateTo && dateFrom !== dateTo)) {
      return null;
    }
    const count = published.filter(
      (p) => toLocalDateKey(p.published_at ?? p.updated_at) === day,
    ).length;
    const network =
      platformFilter === 'all' ? 'todas las redes' : platformFilterLabel(platformFilter);
    return { day, count, network };
  }, [dateFrom, dateTo, published, platformFilter]);

  if (loading) {
    return <p className="text-muted">Cargando calendario…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Calendario</h1>
        <p className="text-sm text-muted">
          Vista en cuadrícula de programados y publicados. Filtra por red y fecha de
          publicación.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-ink">
          <span className="mb-1 block text-xs font-medium text-muted">Red social</span>
          <select
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value as PlatformFilter);
              setScheduledPage(1);
              setPublishedPage(1);
              setFailedPage(1);
            }}
            className="min-w-[180px] rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
          >
            {PLATFORM_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-ink">
          <span className="mb-1 block text-xs font-medium text-muted">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setScheduledPage(1);
              setPublishedPage(1);
              setFailedPage(1);
            }}
            className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-sm text-ink">
          <span className="mb-1 block text-xs font-medium text-muted">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setScheduledPage(1);
              setPublishedPage(1);
              setFailedPage(1);
            }}
            className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
          />
        </label>
        {(dateFrom || dateTo || platformFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setPlatformFilter('all');
              setScheduledPage(1);
              setPublishedPage(1);
              setFailedPage(1);
            }}
            className="rounded-md border border-line-strong px-3 py-2 text-xs text-muted hover:bg-canvas"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {daySummary && (
        <p className="rounded-md border border-line bg-canvas/60 px-3 py-2 text-sm text-ink">
          <strong>{daySummary.count}</strong> publicados el{' '}
          <strong>{daySummary.day}</strong> en {daySummary.network}.
        </p>
      )}

      <PostGridSection
        title="Programados"
        posts={scheduled}
        clients={clients}
        page={scheduledPage}
        onPageChange={setScheduledPage}
        label="programados"
        emptyText="No hay posts programados con estos filtros."
        onOpen={setDetailPost}
      />

      {failed.length > 0 && (
        <PostGridSection
          title="Con errores"
          titleClassName="text-sm font-medium text-red-600"
          posts={failed}
          clients={clients}
          page={failedPage}
          onPageChange={setFailedPage}
          label="con errores"
          emptyText=""
          onOpen={setDetailPost}
        />
      )}

      <PostGridSection
        title="Publicados"
        posts={published}
        clients={clients}
        page={publishedPage}
        onPageChange={setPublishedPage}
        label="publicados"
        emptyText="No hay posts publicados con estos filtros."
        onOpen={setDetailPost}
      />

      {detailPost && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle del post"
          onClick={() => setDetailPost(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-canvas p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Vista del post</h3>
              <button
                type="button"
                onClick={() => setDetailPost(null)}
                className="rounded-md border border-line-strong px-2 py-1 text-xs text-muted hover:bg-surface"
              >
                Cerrar
              </button>
            </div>
            <PostCard post={detailPost} clientName={clients[detailPost.client_id]}>
              {detailPost.status === 'published' && (
                <span className="text-xs text-muted">
                  Publicado: {formatDate(detailPost.published_at)}
                </span>
              )}
            </PostCard>
          </div>
        </div>
      )}
    </div>
  );
}
