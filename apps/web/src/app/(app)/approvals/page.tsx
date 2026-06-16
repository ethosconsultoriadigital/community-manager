'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { PostCard } from '@/components/PostCard';
import type { Client, Post } from '@/lib/types';

function defaultScheduleValue() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export default function ApprovalsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});

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

  const pending = posts.filter((p) => p.status === 'pending_approval');
  const approved = posts.filter((p) => p.status === 'approved');

  async function runAction(postId: string, fn: () => Promise<unknown>) {
    setActionId(postId);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error en la acción');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return <p className="text-slate-400">Cargando bandeja…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Bandeja de aprobación</h1>
        <p className="text-sm text-slate-400">
          Revisa, aprueba o rechaza contenido antes de programarlo.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Pendientes ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No hay posts pendientes de aprobación.</p>
        ) : (
          pending.map((post) => (
            <PostCard key={post.id} post={post} clientName={clients[post.client_id]}>
              <button
                type="button"
                disabled={actionId === post.id}
                onClick={() =>
                  runAction(post.id, () =>
                    apiFetch(`/posts/${post.id}/approve`, { method: 'POST' }),
                  )
                }
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={actionId === post.id}
                onClick={() =>
                  runAction(post.id, () =>
                    apiFetch(`/posts/${post.id}/reject`, {
                      method: 'POST',
                      body: JSON.stringify({ comment: 'Rechazado desde UI' }),
                    }),
                  )
                }
                className="rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950 disabled:opacity-50"
              >
                Rechazar
              </button>
            </PostCard>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Aprobados — programar ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-500">No hay posts aprobados sin programar.</p>
        ) : (
          approved.map((post) => (
            <PostCard key={post.id} post={post} clientName={clients[post.client_id]}>
              <input
                type="datetime-local"
                value={scheduleAt[post.id] ?? defaultScheduleValue()}
                onChange={(e) =>
                  setScheduleAt((prev) => ({ ...prev, [post.id]: e.target.value }))
                }
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
              />
              <button
                type="button"
                disabled={actionId === post.id}
                onClick={() => {
                  const raw = scheduleAt[post.id] ?? defaultScheduleValue();
                  const iso = new Date(raw).toISOString();
                  return runAction(post.id, () =>
                    apiFetch(`/posts/${post.id}/schedule`, {
                      method: 'POST',
                      body: JSON.stringify({ scheduledAt: iso }),
                    }),
                  );
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Programar
              </button>
            </PostCard>
          ))
        )}
      </section>
    </div>
  );
}
