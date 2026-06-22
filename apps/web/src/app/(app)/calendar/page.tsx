'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { PostCard, formatDate } from '@/components/PostCard';
import { paginate } from '@/lib/pagination';
import type { Client, Post } from '@/lib/types';

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [publishedPage, setPublishedPage] = useState(1);

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

  const scheduled = useMemo(
    () =>
      posts
        .filter((p) => p.status === 'scheduled' && p.scheduled_at)
        .sort(
          (a, b) =>
            new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime(),
        ),
    [posts],
  );

  const published = useMemo(
    () =>
      posts
        .filter((p) => p.status === 'published')
        .sort(
          (a, b) =>
            new Date(b.published_at ?? b.updated_at).getTime() -
            new Date(a.published_at ?? a.updated_at).getTime(),
        ),
    [posts],
  );

  const scheduledPaginated = useMemo(
    () => paginate(scheduled, scheduledPage),
    [scheduled, scheduledPage],
  );
  const publishedPaginated = useMemo(
    () => paginate(published, publishedPage),
    [published, publishedPage],
  );

  useEffect(() => {
    if (scheduledPage > scheduledPaginated.totalPages) {
      setScheduledPage(scheduledPaginated.safePage);
    }
  }, [scheduledPage, scheduledPaginated.totalPages, scheduledPaginated.safePage]);

  useEffect(() => {
    if (publishedPage > publishedPaginated.totalPages) {
      setPublishedPage(publishedPaginated.safePage);
    }
  }, [publishedPage, publishedPaginated.totalPages, publishedPaginated.safePage]);

  if (loading) {
    return <p className="text-slate-400">Cargando calendario…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Calendario</h1>
        <p className="text-sm text-slate-400">
          Posts programados y publicados.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Programados ({scheduled.length})
        </h2>
        {scheduled.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay posts programados. Aprueba contenido en la bandeja y programa una fecha.
          </p>
        ) : (
          <>
            {scheduledPaginated.slice.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                clientName={clients[post.client_id]}
              />
            ))}
            <Pagination
              page={scheduledPaginated.safePage}
              totalPages={scheduledPaginated.totalPages}
              totalItems={scheduledPaginated.totalItems}
              onPageChange={setScheduledPage}
              label="programados"
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Publicados ({published.length})
        </h2>
        {published.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay posts publicados.</p>
        ) : (
          <>
            {publishedPaginated.slice.map((post) => (
              <PostCard key={post.id} post={post} clientName={clients[post.client_id]}>
                <span className="text-xs text-slate-500">
                  Publicado: {formatDate(post.published_at)}
                </span>
              </PostCard>
            ))}
            <Pagination
              page={publishedPaginated.safePage}
              totalPages={publishedPaginated.totalPages}
              totalItems={publishedPaginated.totalItems}
              onPageChange={setPublishedPage}
              label="publicados"
            />
          </>
        )}
      </section>
    </div>
  );
}
