'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import type { AnalyticsSummary, Client } from '@/lib/types';

export default function ReportesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [days, setDays] = useState('30');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams({ days });
    if (clientId) params.set('clientId', clientId);
    const data = await apiFetch<AnalyticsSummary>(`/analytics/summary?${params}`);
    setSummary(data);
  }, [clientId, days]);

  useEffect(() => {
    apiFetch<Client[]>('/clients')
      .then((data) => {
        const active = data.filter((c) => c.is_active);
        setClients(active);
        setClientId((prev) => prev || active[0]?.id || '');
      })
      .catch(() => setError('No se pudieron cargar los clientes'));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadSummary()
      .catch(() => setError('No se pudieron cargar las métricas'))
      .finally(() => setLoading(false));
  }, [loadSummary]);

  async function syncMetrics() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ synced: number; failed: number; skipped: number }>(
        '/analytics/sync',
        { method: 'POST' },
      );
      setMessage(
        `Sincronizado: ${result.synced} ok, ${result.failed} fallidas, ${result.skipped} omitidas.`,
      );
      await loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  if (loading && !summary) {
    return <p className="text-slate-400">Cargando reportes…</p>;
  }

  const totals = summary?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Reportes</h1>
        <p className="text-sm text-slate-400">
          Métricas de posts publicados en Meta (sincronización cada 6 h).
        </p>
      </div>

      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Cliente</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Período (días)</span>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="7">7</option>
            <option value="30">30</option>
            <option value="90">90</option>
          </select>
        </label>
        <button
          type="button"
          onClick={syncMetrics}
          disabled={syncing}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      {summary && (
        <>
          <p className="text-xs text-slate-500">
            Destinos publicados: {summary.publishedTargets} · Con métricas: {summary.withMetrics}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Impresiones', value: totals?.impressions ?? 0 },
              { label: 'Alcance', value: totals?.reach ?? 0 },
              { label: 'Engagement', value: totals?.engagement ?? 0 },
              { label: 'Me gusta', value: totals?.likes ?? 0 },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
              >
                <p className="text-2xl font-semibold text-white">{card.value.toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-400">{card.label}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-slate-300">Mejores posts</h2>
            {summary.topPosts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no hay métricas. Publica contenido y pulsa «Sincronizar ahora».
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.topPosts.map((post) => (
                  <li
                    key={post.postId}
                    className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
                  >
                    <p className="text-sm text-white line-clamp-2">
                      {post.caption ?? '(sin caption)'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Engagement: {post.engagement} · Impresiones: {post.impressions} · Likes:{' '}
                      {post.likes}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
