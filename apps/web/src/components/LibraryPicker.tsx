'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import type { LibraryItem } from '@/lib/types';

type PickerKind = 'text' | 'media';

export function LibraryPicker({
  clientId,
  kind,
  open,
  onClose,
  onSelect,
}: {
  clientId: string;
  kind: PickerKind;
  open: boolean;
  onClose: () => void;
  onSelect: (item: LibraryItem) => void;
}) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    setError(null);
    const query =
      kind === 'text'
        ? `clientId=${clientId}&kind=text`
        : `clientId=${clientId}`;
    apiFetch<LibraryItem[]>(`/library?${query}`)
      .then((data) => {
        const filtered =
          kind === 'media'
            ? data.filter((i) => i.kind === 'image' || i.kind === 'video')
            : data.filter((i) => i.kind === 'text');
        setItems(filtered);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la biblioteca');
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [open, clientId, kind]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Biblioteca de contenido"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-canvas p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {kind === 'text' ? 'Elegir texto' : 'Elegir imagen o video'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-strong px-2 py-1 text-xs text-muted hover:bg-surface"
          >
            Cerrar
          </button>
        </div>

        {loading && <p className="text-sm text-muted">Cargando…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-muted">
            No hay ítems guardados para este cliente. Guarda desde un post o desde Composer.
          </p>
        )}

        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="flex w-full items-start gap-3 rounded-md border border-line bg-white p-3 text-left hover:border-brand hover:bg-surface"
              >
                {(item.kind === 'image' || item.kind === 'video') && item.storage_url && (
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-canvas">
                    {item.kind === 'image' ? (
                      <img
                        src={item.storage_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.storage_url}
                        className="h-full w-full object-cover"
                        muted
                      />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink">
                    {item.title || (item.kind === 'text' ? 'Texto' : item.kind)}
                  </p>
                  {item.kind === 'text' && item.caption && (
                    <p className="mt-0.5 line-clamp-3 text-xs text-muted">{item.caption}</p>
                  )}
                  {item.hashtags?.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {item.hashtags.join(' ')}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
