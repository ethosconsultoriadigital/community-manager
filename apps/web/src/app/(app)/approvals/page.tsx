'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApprovalEditForm } from '@/components/ApprovalEditForm';
import { ApiError, apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { PostCard } from '@/components/PostCard';
import { paginate } from '@/lib/pagination';
import {
  PLATFORM_FILTERS,
  platformFilterLabel,
  postMatchesPlatform,
  type PlatformFilter,
} from '@/lib/platform-filters';
import type { Client, Post } from '@/lib/types';
import { postHasMedia, StoryPublishCheckbox } from '@/lib/story-publish';

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
  const [message, setMessage] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [page, setPage] = useState(1);
  const [alsoStory, setAlsoStory] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [postsData, clientsData] = await Promise.all([
      apiFetch<Post[]>('/posts'),
      apiFetch<Client[]>('/clients'),
    ]);
    setPosts(postsData);
    setAlsoStory(
      Object.fromEntries(
        postsData.map((p) => [p.id, Boolean(p.also_publish_as_story)]),
      ),
    );
    setClients(Object.fromEntries(clientsData.map((c) => [c.id, c.name])));
  }, []);

  useEffect(() => {
    load()
      .catch(() => setError('No se pudieron cargar los posts'))
      .finally(() => setLoading(false));
  }, [load]);

  /** Pendientes + aprobados sin programar, en el mismo listado (aprobar no mueve el post abajo). */
  const inbox = useMemo(() => {
    return posts
      .filter(
        (p) =>
          (p.status === 'pending_approval' || p.status === 'approved') &&
          postMatchesPlatform(p, platformFilter),
      )
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [posts, platformFilter]);

  const pendingTotalAll = useMemo(
    () => posts.filter((p) => p.status === 'pending_approval').length,
    [posts],
  );

  const paginated = useMemo(() => paginate(inbox, page), [inbox, page]);

  useEffect(() => {
    if (page > paginated.totalPages) setPage(paginated.safePage);
  }, [page, paginated.totalPages, paginated.safePage]);

  async function runAction(postId: string, fn: () => Promise<unknown>, okMessage?: string) {
    setActionId(postId);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await load();
      if (okMessage) setMessage(okMessage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error en la acción');
    } finally {
      setActionId(null);
    }
  }

  async function runPurge(
    mode: 'stale' | 'all_radar' | 'all',
    confirmText: string,
  ) {
    if (!window.confirm(confirmText)) return;
    setActionId('purge');
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{
        scanned: number;
        deleted: number;
        kept: number;
        mode: string;
      }>(`/content-sources/purge-invalid-pending?mode=${mode}`, { method: 'POST' });
      await load();
      setPage(1);
      setMessage(
        `Limpieza (${result.mode}): eliminados ${result.deleted}` +
          (result.kept ? `, conservados ${result.kept}` : '') +
          '.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al limpiar pendientes');
    } finally {
      setActionId(null);
    }
  }

  async function toggleAlsoStory(postId: string, value: boolean) {
    setAlsoStory((prev) => ({ ...prev, [postId]: value }));
    setActionId(postId);
    setError(null);
    try {
      await apiFetch(`/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({ alsoPublishAsStory: value }),
      });
    } catch (err) {
      setAlsoStory((prev) => ({ ...prev, [postId]: !value }));
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la opción de Story');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return <p className="text-muted">Cargando bandeja…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Bandeja de aprobación</h1>
        <p className="text-sm text-muted">
          Aprueba aquí mismo y programa la fecha sin que el post se mueva a otra sección.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-ink">
          <span className="mb-1 block text-xs font-medium text-muted">Red social</span>
          <select
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value as PlatformFilter);
              setPage(1);
            }}
            className="min-w-[200px] rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
          >
            {PLATFORM_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-canvas/60 p-3">
        <p className="w-full text-xs text-muted">
          <strong className="font-medium text-ink">Cómo funcionan:</strong> borran posts
          pendientes de la bandeja. El historial viejo queda rechazado y no vuelve. Las
          noticias que sigan pasando el filtro de Conectar fuente (p. ej. hoy + url Radarmex)
          se pueden volver a crear al sincronizar.
        </p>
        <button
          type="button"
          disabled={actionId !== null || pendingTotalAll === 0}
          onClick={() =>
            runPurge(
              'stale',
              `¿Eliminar pendientes de la fuente que NO son de hoy (${pendingTotalAll} en bandeja)? Se conservan solo los de captura/creación de hoy.`,
            )
          }
          className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
        >
          Limpiar días anteriores
        </button>
        <button
          type="button"
          disabled={actionId !== null || pendingTotalAll === 0}
          onClick={() =>
            runPurge(
              'all_radar',
              `¿Vaciar TODOS los pendientes de la fuente? Se quitan de la bandeja. Al sincronizar de nuevo solo volverán las que pasen el filtro actual (hoy + url Radarmex).`,
            )
          }
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          Vaciar pendientes de la fuente
        </button>
        <button
          type="button"
          disabled={actionId !== null || pendingTotalAll === 0}
          onClick={() =>
            runPurge(
              'all',
              `¿Eliminar TODOS los ${pendingTotalAll} posts pendientes (fuente + manuales)? Esta acción no se puede deshacer.`,
            )
          }
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Eliminar todos los pendientes
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">
          Bandeja ({inbox.length}
          {platformFilter !== 'all' ? ` · ${platformFilterLabel(platformFilter)}` : ''})
        </h2>
        {inbox.length === 0 ? (
          <p className="text-sm text-muted">
            {platformFilter === 'all'
              ? 'No hay posts pendientes ni aprobados por programar.'
              : `No hay posts de ${platformFilterLabel(platformFilter)} en la bandeja.`}
          </p>
        ) : (
          <>
            {paginated.slice.map((post) => (
              <div key={post.id} id={`approval-${post.id}`}>
                <PostCard post={post} clientName={clients[post.client_id]}>
                  {editingId !== post.id && post.status === 'pending_approval' && (
                    <>
                      {postHasMedia(post) && (
                        <StoryPublishCheckbox
                          checked={alsoStory[post.id] ?? false}
                          disabled={actionId === post.id}
                          onChange={(v) => toggleAlsoStory(post.id, v)}
                        />
                      )}
                      <button
                        type="button"
                        disabled={actionId === post.id}
                        onClick={() => {
                          setEditingId(post.id);
                          setError(null);
                          setMessage(null);
                        }}
                        className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={actionId === post.id}
                        onClick={() =>
                          runAction(
                            post.id,
                            () => apiFetch(`/posts/${post.id}/approve`, { method: 'POST' }),
                            'Aprobado. Elige fecha aquí mismo y programa.',
                          )
                        }
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={actionId === post.id}
                        onClick={() =>
                          runAction(
                            post.id,
                            () =>
                              apiFetch(`/posts/${post.id}/reject`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  comment: 'Cancelado desde bandeja de aprobación',
                                }),
                              }),
                            'Publicación cancelada (vuelve a borrador).',
                          )
                        }
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {editingId !== post.id && post.status === 'approved' && (
                    <>
                      {postHasMedia(post) && (
                        <StoryPublishCheckbox
                          checked={alsoStory[post.id] ?? false}
                          disabled={actionId === post.id}
                          onChange={(v) => toggleAlsoStory(post.id, v)}
                        />
                      )}
                      <button
                        type="button"
                        disabled={actionId === post.id}
                        onClick={() => {
                          setEditingId(post.id);
                          setError(null);
                          setMessage(null);
                        }}
                        className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-ink">Publicar:</span>
                        <input
                          type="datetime-local"
                          value={scheduleAt[post.id] ?? defaultScheduleValue()}
                          onChange={(e) =>
                            setScheduleAt((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                          className="rounded-md border border-line-strong bg-white px-2 py-1 text-xs text-ink"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={actionId === post.id}
                        onClick={() => {
                          const raw = scheduleAt[post.id] ?? defaultScheduleValue();
                          const iso = new Date(raw).toISOString();
                          return runAction(
                            post.id,
                            () =>
                              apiFetch(`/posts/${post.id}/schedule`, {
                                method: 'POST',
                                body: JSON.stringify({ scheduledAt: iso }),
                              }),
                            'Post programado. Lo verás en Calendario.',
                          );
                        }}
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        Programar
                      </button>
                    </>
                  )}
                </PostCard>
                {editingId === post.id && (
                  <ApprovalEditForm
                    post={post}
                    busy={actionId === post.id}
                    onError={(msg) => setError(msg || null)}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      setMessage('Cambios guardados.');
                      await load();
                    }}
                  />
                )}
              </div>
            ))}
            <Pagination
              page={paginated.safePage}
              totalPages={paginated.totalPages}
              totalItems={paginated.totalItems}
              onPageChange={setPage}
              label="en bandeja"
            />
          </>
        )}
      </section>
    </div>
  );
}
