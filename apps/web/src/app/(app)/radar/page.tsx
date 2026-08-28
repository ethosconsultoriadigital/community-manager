'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ClientScopeField } from '@/components/ClientScopeField';
import { ApiError, apiFetch } from '@/lib/api';
import { useAssignedClients } from '@/lib/use-assigned-clients';
import type {
  ContentSource,
  GoogleSheetStatus,
  RadarSyncResult,
  SourceItem,
} from '@/lib/types';

function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return fromUrl?.[1] ?? trimmed;
}

function parseGid(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&#]gid=([0-9]+)/);
  return fromUrl?.[1] ?? trimmed;
}

export default function RadarPage() {
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: clientsLoading,
    error: clientsError,
  } = useAssignedClients();

  const [sources, setSources] = useState<ContentSource[]>([]);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [google, setGoogle] = useState<GoogleSheetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('Radar Sheet');
  const [sheetInput, setSheetInput] = useState('');
  const [gidInput, setGidInput] = useState('1413170342');
  const [minScore, setMinScore] = useState('0.7');

  const clientSources = useMemo(
    () => sources.filter((s) => s.client_id === clientId),
    [sources, clientId],
  );
  const activeSource = clientSources[0] ?? null;

  const load = useCallback(async () => {
    if (!clientId) {
      setSources([]);
      setItems([]);
      return;
    }
    const [src, status] = await Promise.all([
      apiFetch<ContentSource[]>(`/content-sources?clientId=${clientId}`),
      apiFetch<GoogleSheetStatus>('/content-sources/google-status'),
    ]);
    setSources(src);
    setGoogle(status);
    const first = src.find((s) => s.client_id === clientId);
    if (first) {
      const list = await apiFetch<SourceItem[]>(`/content-sources/${first.id}/items`);
      setItems(list.slice(0, 20));
      const cfg = first.config ?? {};
      if (typeof cfg.spreadsheetId === 'string') setSheetInput(String(cfg.spreadsheetId));
      if (cfg.gid != null) setGidInput(String(cfg.gid));
      setName(first.name);
      if (first.min_score != null) setMinScore(String(first.min_score));
    } else {
      setItems([]);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientsLoading) return;
    load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar Radar'),
      )
      .finally(() => setLoading(false));
  }, [clientsLoading, load]);

  async function handleSaveSource(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const spreadsheetId = parseSpreadsheetId(sheetInput);
      const gid = parseGid(gidInput);
      if (!spreadsheetId) throw new ApiError('Indica el ID o URL del Google Sheet', 400);
      const score = Number(minScore);
      const config = {
        spreadsheetId,
        gid,
        columnMap: 'radarmex',
      };
      if (activeSource) {
        await apiFetch(`/content-sources/${activeSource.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim() || 'Radar Sheet',
            config,
            minScore: Number.isFinite(score) ? score : 0.7,
            isActive: true,
          }),
        });
        setMessage('Fuente actualizada.');
      } else {
        await apiFetch('/content-sources', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            type: 'news_radar',
            name: name.trim() || 'Radar Sheet',
            config,
            minScore: Number.isFinite(score) ? score : 0.7,
          }),
        });
        setMessage('Fuente creada.');
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la fuente');
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!activeSource) {
      setError('Guarda primero la fuente del Sheet');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<RadarSyncResult>(
        `/content-sources/${activeSource.id}/sync`,
        { method: 'POST' },
      );
      setMessage(
        `Sync OK: ingeridos ${result.ingest.ingested}, omitidos sin publicar ${result.ingest.notFlagged}, ` +
          `bajo score ${result.ingest.belowMinScore}, posts creados ${result.promote.postsCreated}. ` +
          'Revisa Aprobaciones.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al sincronizar');
    } finally {
      setBusy(false);
    }
  }

  if (clientsLoading || loading) {
    return <p className="text-muted">Cargando Radar…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Radar de noticias</h1>
        <p className="text-sm text-muted">
          Conecta el Google Sheet del cliente. Se importan filas con publicar=TRUE y
          sentimiento/score positivo, y se crean posts en Aprobaciones (uno por red).
        </p>
      </div>

      {(clientsError || error) && (
        <p className="text-sm text-red-600">{clientsError ?? error}</p>
      )}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <ClientScopeField
        clients={clients}
        clientId={clientId}
        onClientIdChange={setClientId}
        showSelector={showClientSelector}
        selectedClient={selectedClient}
      />

      <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Google Sheets</h2>
        {google?.configured ? (
          <p className="text-xs text-muted">
            Service account configurada. Comparte el Sheet (solo lectura) con:{' '}
            <code className="rounded bg-canvas px-1 text-ink">{google.clientEmail}</code>
          </p>
        ) : (
          <p className="text-xs text-amber-700">
            Falta <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> en la API. Sin eso solo funciona el
            mock de desarrollo.
          </p>
        )}

        <form onSubmit={handleSaveSource} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nombre de la fuente</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">URL o ID del Spreadsheet</span>
            <input
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/… o el ID"
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">gid de la pestaña</span>
            <input
              value={gidInput}
              onChange={(e) => setGidInput(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Score mínimo</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="w-full max-w-[8rem] rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !clientId}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {activeSource ? 'Guardar cambios' : 'Crear fuente'}
            </button>
            <button
              type="button"
              disabled={busy || !activeSource}
              onClick={handleSync}
              className="rounded-md border border-brand bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
            >
              {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">
          Últimos items ingeridos ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay items. Guarda y sincroniza el Sheet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {items.map((item) => (
              <li key={item.id} className="px-3 py-2 text-sm">
                <p className="font-medium text-ink">{item.title ?? item.external_id}</p>
                <p className="text-xs text-muted">
                  {item.sentiment ?? '—'} · score {String(item.sentiment_score ?? '—')} ·{' '}
                  {item.status}
                  {item.post_id ? ' · promovido' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
