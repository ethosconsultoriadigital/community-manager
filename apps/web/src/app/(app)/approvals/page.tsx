'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { PostCard } from '@/components/PostCard';
import { paginate } from '@/lib/pagination';
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
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);

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

  const pending = useMemo(
    () => posts.filter((p) => p.status === 'pending_approval'),
    [posts],
  );
  const approved = useMemo(
    () => posts.filter((p) => p.status === 'approved'),
    [posts],
  );

  const pendingPaginated = useMemo(
    () => paginate(pending, pendingPage),
    [pending, pendingPage],
  );
  const approvedPaginated = useMemo(
    () => paginate(approved, approvedPage),
    [approved, approvedPage],
  );

  useEffect(() => {
    if (pendingPage > pendingPaginated.totalPages) {
      setPendingPage(pendingPaginated.safePage);
    }
  }, [pendingPage, pendingPaginated.totalPages, pendingPaginated.safePage]);

  useEffect(() => {
    if (approvedPage > approvedPaginated.totalPages) {
      setApprovedPage(approvedPaginated.safePage);
    }
  }, [approvedPage, approvedPaginated.totalPages, approvedPaginated.safePage]);

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
          <>
            {pendingPaginated.slice.map((post) => (
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
            ))}
            <Pagination
              page={pendingPaginated.safePage}
              totalPages={pendingPaginated.totalPages}
              totalItems={pendingPaginated.totalItems}
              onPageChange={setPendingPage}
              label="pendientes"
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Aprobados — programar ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-500">No hay posts aprobados sin programar.</p>
        ) : (
          <>
            {approvedPaginated.slice.map((post) => (
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
            ))}
            <Pagination
              page={approvedPaginated.safePage}
              totalPages={approvedPaginated.totalPages}
              totalItems={approvedPaginated.totalItems}
              onPageChange={setApprovedPage}
              label="aprobados"
            />
          </>
        )}
      </section>
    </div>
  );
}
