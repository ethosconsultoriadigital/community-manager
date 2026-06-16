'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PostCard, formatDate } from '@/components/PostCard';
import type { Client, Post } from '@/lib/types';

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const byDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of scheduled) {
      const key = new Date(post.scheduled_at!).toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [scheduled]);

  const recentPublished = useMemo(
    () =>
      posts
        .filter((p) => p.status === 'published')
        .sort(
          (a, b) =>
            new Date(b.published_at ?? b.updated_at).getTime() -
            new Date(a.published_at ?? a.updated_at).getTime(),
        )
        .slice(0, 5),
    [posts],
  );

  if (loading) {
    return <p className="text-slate-400">Cargando calendario…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Calendario</h1>
        <p className="text-sm text-slate-400">
          Posts programados y recientes publicados.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-slate-300">
          Programados ({scheduled.length})
        </h2>
        {byDate.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay posts programados. Aprueba contenido en la bandeja y programa una fecha.
          </p>
        ) : (
          byDate.map(([dateLabel, dayPosts]) => (
            <div key={dateLabel} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                {dateLabel}
              </h3>
              {dayPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  clientName={clients[post.client_id]}
                />
              ))}
            </div>
          ))
        )}
      </section>

      {recentPublished.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300">Publicados recientemente</h2>
          {recentPublished.map((post) => (
            <PostCard key={post.id} post={post} clientName={clients[post.client_id]}>
              <span className="text-xs text-slate-500">
                Publicado: {formatDate(post.published_at)}
              </span>
            </PostCard>
          ))}
        </section>
      )}
    </div>
  );
}
