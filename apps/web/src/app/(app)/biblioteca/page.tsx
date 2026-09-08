'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientScopeField } from '@/components/ClientScopeField';
import { ApiError, apiFetch } from '@/lib/api';
import { useAssignedClients } from '@/lib/use-assigned-clients';
import type { LibraryItem } from '@/lib/types';

type KindFilter = 'all' | 'text' | 'image' | 'video';

export default function BibliotecaPage() {
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: clientsLoading,
    error: clientsError,
  } = useAssignedClients();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) {
      setItems([]);
      return;
    }
    const data = await apiFetch<LibraryItem[]>(`/library?clientId=${clientId}`);
    setItems(data);
  }, [clientId]);

  useEffect(() => {
    if (clientsLoading) return;
    setLoading(true);
    load()
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la biblioteca');
      })
      .finally(() => setLoading(false));
  }, [clientsLoading, load]);

  useEffect(() => {
    if (clientsError) setError(clientsError);
  }, [clientsError]);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return items;
    return items.filter((i) => i.kind === kindFilter);
  }, [items, kindFilter]);

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este ítem de la biblioteca?')) return;
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/library/${id}`, { method: 'DELETE' });
      setMessage('Ítem eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  }

  if (clientsLoading || loading) {
    return <p className="text-muted">Cargando biblioteca…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Biblioteca</h1>
        <p className="text-sm text-muted">
          Textos, imágenes y videos guardados para reutilizar en nuevas publicaciones.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <ClientScopeField
        clients={clients}
        clientId={clientId}
        onClientIdChange={setClientId}
        showSelector={showClientSelector}
        selectedClient={selectedClient}
        className="block max-w-sm"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: 'Todos' },
            { id: 'text', label: 'Textos' },
            { id: 'image', label: 'Imágenes' },
            { id: 'video', label: 'Videos' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setKindFilter(opt.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              kindFilter === opt.id
                ? 'bg-brand text-white'
                : 'border border-line-strong text-muted hover:bg-surface'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!clientId ? (
        <p className="text-sm text-muted">Selecciona un cliente para ver su biblioteca.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          Aún no hay contenido. Usa «Guardar en biblioteca» en Calendario, Aprobaciones o Composer.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-line bg-surface p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {item.kind === 'text' ? 'Texto' : item.kind === 'image' ? 'Imagen' : 'Video'}
                  </p>
                  <p className="text-sm font-medium text-ink">{item.title || 'Sin título'}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleDelete(item.id)}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
              {item.kind === 'text' && item.caption && (
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-ink">{item.caption}</p>
              )}
              {item.kind === 'image' && item.storage_url && (
                <img
                  src={item.storage_url}
                  alt=""
                  className="mt-2 max-h-40 w-full rounded object-cover"
                />
              )}
              {item.kind === 'video' && item.storage_url && (
                <video
                  src={item.storage_url}
                  controls
                  className="mt-2 max-h-40 w-full rounded bg-black"
                />
              )}
              {item.hashtags?.length > 0 && (
                <p className="mt-2 text-xs text-muted">{item.hashtags.join(' ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
