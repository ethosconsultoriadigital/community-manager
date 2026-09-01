'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError, apiFetch, getStoredToken } from '@/lib/api';
import { ClientScopeField } from '@/components/ClientScopeField';
import { DashboardStatCard } from '@/components/DashboardStatCard';
import { useAssignedClients } from '@/lib/use-assigned-clients';
import {
  PLATFORM_FILTERS,
  platformFilterLabel,
  type PlatformFilter,
} from '@/lib/platform-filters';
import type { AnalyticsSummary, Post } from '@/lib/types';

const CHART_COLORS = ['#1877F2', '#E4405F', '#6366f1', '#10b981'];

export default function ReportesPage() {
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: clientsLoading,
    error: clientsError,
  } = useAssignedClients();
  const [days, setDays] = useState('30');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [previewPosts, setPreviewPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams({ days });
    if (clientId) params.set('clientId', clientId);
    if (platformFilter !== 'all') params.set('platform', platformFilter);
    const data = await apiFetch<AnalyticsSummary>(`/analytics/summary?${params}`);
    setSummary(data);

    const posts = await apiFetch<Post[]>('/posts?withMetrics=1');
    const published = posts
      .filter((p) => p.status === 'published')
      .filter((p) => {
        if (platformFilter === 'all') return true;
        return p.post_targets.some((t) => t.social_accounts.platform === platformFilter);
      })
      .slice(0, 8);
    setPreviewPosts(published);
  }, [clientId, days, platformFilter]);

  useEffect(() => {
    if (clientsError) setError(clientsError);
  }, [clientsError]);

  useEffect(() => {
    if (clientsLoading) return;
    setLoading(true);
    setError(null);
    loadSummary()
      .catch(() => setError('No se pudieron cargar las métricas'))
      .finally(() => setLoading(false));
  }, [loadSummary, clientsLoading]);

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

  async function downloadPdf() {
    setDownloadingPdf(true);
    setError(null);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      params.set('days', days);
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const res = await fetch(`${base}/analytics/report/pdf?${params}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.message ?? 'No se pudo generar el PDF', res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${days}d.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Reporte PDF descargado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  const pieData = useMemo(() => {
    if (!summary?.byPlatform) return [];
    return Object.entries(summary.byPlatform)
      .filter(([, m]) => m.engagement > 0)
      .map(([name, m]) => ({ name, value: m.engagement }));
  }, [summary]);

  const barData = useMemo(() => {
    if (!summary?.byPlatform) return [];
    return Object.entries(summary.byPlatform).map(([name, m]) => ({
      name: name === 'facebook' ? 'Facebook' : name === 'instagram' ? 'Instagram' : name,
      likes: m.likes,
      comments: m.comments,
      impressions: m.impressions,
    }));
  }, [summary]);

  const metricCards = useMemo(
    () => [
      { label: 'Impresiones', value: summary?.totals.impressions ?? 0, tone: 'metric' as const },
      { label: 'Alcance', value: summary?.totals.reach ?? 0, tone: 'metric' as const },
      { label: 'Engagement', value: summary?.totals.engagement ?? 0, tone: 'published' as const },
      { label: 'Me gusta', value: summary?.totals.likes ?? 0, tone: 'approved' as const },
    ],
    [summary],
  );

  if (loading && !summary) {
    return <p className="text-muted">Cargando reportes…</p>;
  }

  const totals = summary?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reportes</h1>
        <p className="text-sm text-muted">
          Métricas de posts publicados en Meta. Gráficos por red y export PDF con análisis IA.
        </p>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <ClientScopeField
          clients={clients}
          clientId={clientId}
          onClientIdChange={setClientId}
          showSelector={showClientSelector}
          selectedClient={selectedClient}
          allowAll={showClientSelector}
          selectClassName="rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Período (días)</span>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
          >
            <option value="7">7</option>
            <option value="30">30</option>
            <option value="90">90</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Red social</span>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
            className="min-w-[160px] rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
          >
            {PLATFORM_FILTERS.filter((p) => p.value === 'all' || ['facebook', 'instagram'].includes(p.value)).map(
              (opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ),
            )}
            <option value="tiktok" disabled>
              TikTok (sin métricas aún)
            </option>
          </select>
        </label>
        <button
          type="button"
          onClick={syncMetrics}
          disabled={syncing}
          className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloadingPdf || !summary}
          className="rounded-md border border-line-strong bg-white px-4 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-50"
        >
          {downloadingPdf ? 'Generando PDF…' : 'Descargar reporte PDF'}
        </button>
      </div>

      {summary && (
        <>
          <p className="text-xs text-muted">
            Destinos publicados: {summary.publishedTargets} · Con métricas: {summary.withMetrics}
            {platformFilter !== 'all' && ` · Filtro: ${platformFilterLabel(platformFilter)}`}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((card) => (
              <DashboardStatCard
                key={card.label}
                label={card.label}
                value={card.value}
                tone={card.tone}
                previewPosts={previewPosts}
              />
            ))}
          </div>

          {(pieData.length > 0 || barData.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {pieData.length > 0 && (
                <section className="rounded-xl border border-line bg-surface p-4">
                  <h2 className="mb-3 text-sm font-medium text-ink">Engagement por red</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </section>
              )}
              {barData.length > 0 && (
                <section className="rounded-xl border border-line bg-surface p-4">
                  <h2 className="mb-3 text-sm font-medium text-ink">Métricas por red</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={barData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="likes" fill="#1877F2" name="Me gusta" />
                      <Bar dataKey="comments" fill="#E4405F" name="Comentarios" />
                      <Bar dataKey="impressions" fill="#6366f1" name="Impresiones" />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              )}
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted">Mejores posts</h2>
            {summary.topPosts.length === 0 ? (
              <p className="text-sm text-muted">
                Aún no hay métricas. Publica contenido y pulsa «Sincronizar ahora».
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {summary.topPosts.map((post) => (
                  <li
                    key={post.postId}
                    className="flex gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-canvas">
                      {post.storageUrl ? (
                        <img src={post.storageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">—</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-ink">{post.caption ?? '(sin caption)'}</p>
                      <p className="mt-1 text-xs text-muted">
                        {post.platform ?? '—'} · Engagement: {post.engagement} · Impresiones:{' '}
                        {post.impressions} · Likes: {post.likes} · Comentarios: {post.comments}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {totals && (
            <p className="text-xs text-muted">
              Totales del período: {totals.comments} comentarios · {totals.shares} compartidos ·{' '}
              {totals.saves} guardados
            </p>
          )}
        </>
      )}
    </div>
  );
}
