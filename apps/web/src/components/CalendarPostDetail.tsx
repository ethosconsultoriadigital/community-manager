'use client';

import { useEffect, useState } from 'react';
import { ApprovalEditForm } from '@/components/ApprovalEditForm';
import { PostCard, formatDate } from '@/components/PostCard';
import { ApiError, apiFetch } from '@/lib/api';
import { sumPostMetrics } from '@/lib/post-metrics';
import { defaultScheduleValue, scheduleValueFromIso } from '@/lib/schedule';
import type { Post, PostInsight } from '@/lib/types';

function PostMetricsBlock({ post, insights }: { post: Post; insights: PostInsight[] | null }) {
  const fromList = sumPostMetrics(post);
  const likes =
    insights?.reduce((sum, row) => sum + (row.likes ?? 0), 0) ?? fromList.likes;
  const comments =
    insights?.reduce((sum, row) => sum + (row.comments ?? 0), 0) ?? fromList.comments;
  const hasData = fromList.hasMetrics || (insights?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <p className="text-xs text-muted">
        Métricas aún no sincronizadas. Puedes forzar la sync en Reportes.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 text-sm text-ink">
      <span>
        <strong>{likes}</strong> me gusta
      </span>
      <span>
        <strong>{comments}</strong> comentarios
      </span>
    </div>
  );
}

export function CalendarPostDetail({
  post,
  clientName,
  onClose,
  onChanged,
}: {
  post: Post;
  clientName?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => scheduleValueFromIso(post.scheduled_at));
  const [insights, setInsights] = useState<PostInsight[] | null>(null);

  const canManage = post.status === 'scheduled' || post.status === 'failed' || post.status === 'publishing';
  const isPublished = post.status === 'published';

  useEffect(() => {
    setScheduleAt(scheduleValueFromIso(post.scheduled_at));
    setEditing(false);
    setError(null);
    setMessage(null);
  }, [post.id, post.scheduled_at]);

  useEffect(() => {
    if (!isPublished) {
      setInsights(null);
      return;
    }
    apiFetch<PostInsight[]>(`/posts/${post.id}/insights`)
      .then(setInsights)
      .catch(() => setInsights([]));
  }, [post.id, isPublished]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('¿Eliminar este post? Esta acción no se puede deshacer.')) return;
    await runAction(
      () => apiFetch(`/posts/${post.id}`, { method: 'DELETE' }),
      'Post eliminado.',
    );
    onClose();
  }

  async function handleUnschedule() {
    if (!window.confirm('¿Quitar del calendario? Volverá a aprobados sin fecha.')) return;
    await runAction(
      () => apiFetch(`/posts/${post.id}/unschedule`, { method: 'POST' }),
      'Post desprogramado. Lo encontrarás en Aprobaciones.',
    );
  }

  async function handleReschedule() {
    const iso = new Date(scheduleAt).toISOString();
    await runAction(
      () =>
        apiFetch(`/posts/${post.id}/schedule`, {
          method: 'POST',
          body: JSON.stringify({ scheduledAt: iso }),
        }),
      post.status === 'failed' || post.status === 'publishing'
        ? 'Post reprogramado tras corregir el error.'
        : 'Horario actualizado.',
    );
  }

  const tileMetrics = isPublished ? sumPostMetrics(post) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del post"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-canvas p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Vista del post</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-strong px-2 py-1 text-xs text-muted hover:bg-surface"
          >
            Cerrar
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {message && <p className="mb-2 text-sm text-emerald-700">{message}</p>}

        <PostCard post={post} clientName={clientName}>
          {isPublished && (
            <div className="space-y-2">
              <span className="text-xs text-muted">
                Publicado: {formatDate(post.published_at)}
              </span>
              <PostMetricsBlock post={post} insights={insights} />
            </div>
          )}
        </PostCard>

        {editing ? (
          <ApprovalEditForm
            post={post}
            busy={busy}
            heading={
              post.status === 'scheduled'
                ? 'Editar post programado'
                : 'Editar post con error'
            }
            onSaved={async () => {
              setEditing(false);
              await onChanged();
              setMessage('Cambios guardados.');
            }}
            onCancel={() => setEditing(false)}
            onError={setError}
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {canManage && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(true);
                    setError(null);
                  }}
                  className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDelete}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </>
            )}

            {post.status === 'scheduled' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleUnschedule}
                  className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas disabled:opacity-50"
                >
                  Quitar del calendario
                </button>
                <label className="flex w-full items-center gap-2 text-xs text-muted sm:w-auto">
                  <span className="font-medium text-ink">Nuevo horario:</span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    disabled={busy}
                    className="rounded-md border border-line-strong bg-white px-2 py-1 text-xs text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReschedule}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  Cambiar horario
                </button>
              </>
            )}

            {(post.status === 'failed' || post.status === 'publishing') && (
              <>
                <label className="flex w-full items-center gap-2 text-xs text-muted sm:w-auto">
                  <span className="font-medium text-ink">Reprogramar:</span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value || defaultScheduleValue())}
                    disabled={busy}
                    className="rounded-md border border-line-strong bg-white px-2 py-1 text-xs text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReschedule}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  Reprogramar publicación
                </button>
              </>
            )}

            {isPublished && tileMetrics?.hasMetrics && (
              <p className="w-full text-xs text-muted">
                Totales agregados de todas las redes publicadas.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
