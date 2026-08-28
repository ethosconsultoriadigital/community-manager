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

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [google, setGoogle] = useState<GoogleSheetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNewSource, setIsNewSource] = useState(false);

  const [name, setName] = useState('Radar Sheet');
  const [sheetInput, setSheetInput] = useState('');
  const [gidInput, setGidInput] = useState('1413170342');
  const [minScore, setMinScore] = useState('0.7');
  const [onlyToday, setOnlyToday] = useState(true);
  const [dateFrom, setDateFrom] = useState(todayLocalIso());
  const [dateTo, setDateTo] = useState(todayLocalIso());

  const clientSources = useMemo(
    () => sources.filter((s) => s.client_id === clientId),
    [sources, clientId],
  );

  const activeSource = useMemo(
    () => clientSources.find((s) => s.id === selectedSourceId) ?? null,
    [clientSources, selectedSourceId],
  );

  function fillFormFromSource(source: ContentSource | null) {
    if (!source) {
      setName('Radar Sheet');
      setSheetInput('');
      setGidInput('1413170342');
      setMinScore('0.7');
      setOnlyToday(true);
      const t = todayLocalIso();
      setDateFrom(t);
      setDateTo(t);
      return;
    }
    const cfg = source.config ?? {};
    setName(source.name);
    setSheetInput(typeof cfg.spreadsheetId === 'string' ? String(cfg.spreadsheetId) : '');
    setGidInput(cfg.gid != null ? String(cfg.gid) : '1413170342');
    if (source.min_score != null) setMinScore(String(source.min_score));
    const from = typeof cfg.dateFrom === 'string' ? cfg.dateFrom : '';
    const to = typeof cfg.dateTo === 'string' ? cfg.dateTo : '';
    const t = todayLocalIso();
    if (!from && !to) {
      setOnlyToday(true);
      setDateFrom(t);
      setDateTo(t);
    } else {
      setOnlyToday(false);
      setDateFrom(from || t);
      setDateTo(to || from || t);
    }
  }

  const load = useCallback(async () => {
    if (!clientId) {
      setSources([]);
      setItems([]);
      setSelectedSourceId(null);
      return;
    }
    const [src, status] = await Promise.all([
      apiFetch<ContentSource[]>(`/content-sources?clientId=${clientId}`),
      apiFetch<GoogleSheetStatus>('/content-sources/google-status'),
    ]);
    setSources(src);
    setGoogle(status);
    const forClient = src.filter((s) => s.client_id === clientId);
    setSelectedSourceId((prev) => {
      if (prev && forClient.some((s) => s.id === prev)) return prev;
      return forClient[0]?.id ?? null;
    });
  }, [clientId]);

  useEffect(() => {
    if (clientsLoading) return;
    load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar Radar'),
      )
      .finally(() => setLoading(false));
  }, [clientsLoading, load]);

  useEffect(() => {
    if (isNewSource) {
      fillFormFromSource(null);
      setItems([]);
      return;
    }
    fillFormFromSource(activeSource);
    if (!activeSource) {
      setItems([]);
      return;
    }
    apiFetch<SourceItem[]>(`/content-sources/${activeSource.id}/items`)
      .then((list) => setItems(list.slice(0, 30)))
      .catch(() => setItems([]));
  }, [activeSource, isNewSource]);

  function buildConfig() {
    const spreadsheetId = parseSpreadsheetId(sheetInput);
    const gid = parseGid(gidInput);
    if (!spreadsheetId) throw new ApiError('Indica el ID o URL del Google Sheet', 400);
    const t = todayLocalIso();
    return {
      spreadsheetId,
      gid,
      columnMap: 'radarmex',
      dateFrom: onlyToday ? t : dateFrom,
      dateTo: onlyToday ? t : dateTo,
    };
  }

  async function handleSaveSource(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const score = Number(minScore);
      const config = buildConfig();
      if (isNewSource || !activeSource) {
        const created = await apiFetch<ContentSource>('/content-sources', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            type: 'news_radar',
            name: name.trim() || 'Radar Sheet',
            config,
            minScore: Number.isFinite(score) ? score : 0.7,
          }),
        });
        setIsNewSource(false);
        setMessage('Fuente creada.');
        await load();
        setSelectedSourceId(created.id);
      } else {
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
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la fuente');
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(sourceId?: string) {
    const id = sourceId ?? activeSource?.id;
    if (!id) {
      setError('Guarda primero la fuente del Sheet');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<RadarSyncResult>(`/content-sources/${id}/sync`, {
        method: 'POST',
      });
      setMessage(
        `Sync OK (${result.ingest.dateFrom} → ${result.ingest.dateTo}): ` +
          `ingeridos ${result.ingest.ingested}, sin URL Radarmex ${result.ingest.skippedNoRadarmexUrl ?? 0}, ` +
          `fuera de fechas ${result.ingest.skippedOutOfDateRange ?? 0}, ` +
          `posts creados ${result.promote.postsCreated}. Revisa Aprobaciones.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al sincronizar');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncAll() {
    if (clientSources.length === 0) {
      setError('No hay fuentes para sincronizar');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let posts = 0;
      for (const s of clientSources) {
        const result = await apiFetch<RadarSyncResult>(`/content-sources/${s.id}/sync`, {
          method: 'POST',
        });
        posts += result.promote.postsCreated;
      }
      setMessage(`Sync de ${clientSources.length} sheet(s) OK. Posts creados: ${posts}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al sincronizar');
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    if (!clientId) return;
    if (
      !window.confirm(
        '¿Eliminar de Aprobaciones los posts del Radar sin URL Radarmex (enlaces de terceros)?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ scanned: number; deleted: number; kept: number }>(
        `/content-sources/purge-invalid-pending?clientId=${clientId}`,
        { method: 'POST' },
      );
      setMessage(
        `Limpieza: revisados ${result.scanned}, eliminados ${result.deleted}, conservados ${result.kept}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al limpiar');
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
          Solo entran a Aprobaciones noticias con <strong>url_radarmex</strong> y{' '}
          <strong>fecha_publicacion</strong> en el rango (por defecto: hoy). Puedes conectar
          varios Sheets por cliente.
        </p>
      </div>

      {(clientsError || error) && (
        <p className="text-sm text-red-600">{clientsError ?? error}</p>
      )}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <ClientScopeField
        clients={clients}
        clientId={clientId}
        onClientIdChange={(id) => {
          setClientId(id);
          setIsNewSource(false);
        }}
        showSelector={showClientSelector}
        selectedClient={selectedClient}
      />

      <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink">Fuentes Google Sheets</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !clientId}
              onClick={() => {
                setIsNewSource(true);
                setSelectedSourceId(null);
              }}
              className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50"
            >
              + Otro Sheet
            </button>
            <button
              type="button"
              disabled={busy || clientSources.length === 0}
              onClick={handleSyncAll}
              className="rounded-md border border-brand bg-white px-3 py-1.5 text-xs font-medium text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
            >
              Sincronizar todos
            </button>
            <button
              type="button"
              disabled={busy || !clientId}
              onClick={handlePurge}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Limpiar aprobaciones inválidas
            </button>
          </div>
        </div>

        {clientSources.length > 0 && (
          <ul className="space-y-1">
            {clientSources.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewSource(false);
                    setSelectedSourceId(s.id);
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    !isNewSource && selectedSourceId === s.id
                      ? 'bg-[#E7F3FF] text-brand'
                      : 'hover:bg-canvas text-ink'
                  }`}
                >
                  {s.name}
                  <span className="ml-2 text-xs text-muted">
                    {String((s.config as { spreadsheetId?: string })?.spreadsheetId ?? '').slice(
                      0,
                      12,
                    )}
                    …
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {google?.configured ? (
          <p className="text-xs text-muted">
            Service account:{' '}
            <code className="rounded bg-canvas px-1 text-ink">{google.clientEmail}</code>
          </p>
        ) : (
          <p className="text-xs text-amber-700">
            Falta <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> en la API.
          </p>
        )}

        <form onSubmit={handleSaveSource} className="space-y-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-muted">
            {isNewSource || !activeSource ? 'Nueva fuente' : 'Editar fuente'}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nombre</span>
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

          <fieldset className="space-y-2 rounded-md border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">
              Fecha de publicación (columna fecha_publicacion)
            </legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={onlyToday}
                onChange={(e) => {
                  setOnlyToday(e.target.checked);
                  if (e.target.checked) {
                    const t = todayLocalIso();
                    setDateFrom(t);
                    setDateTo(t);
                  }
                }}
              />
              Solo el día de hoy
            </label>
            {!onlyToday && (
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Desde</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Hasta</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
                    required
                  />
                </label>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !clientId}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {isNewSource || !activeSource ? 'Crear fuente' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              disabled={busy || isNewSource || !activeSource}
              onClick={() => handleSync()}
              className="rounded-md border border-brand bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
            >
              {busy ? 'Sincronizando…' : 'Sincronizar esta fuente'}
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
                  {item.source_url ? ' · tiene url_radarmex' : ' · sin url_radarmex'}
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
