'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import type { Client, Post, SocialAccount } from '@/lib/types';

export default function ComposerPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [clientId, setClientId] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const data = await apiFetch<Client[]>('/clients');
    setClients(data.filter((c) => c.is_active));
    if (data.length > 0) setClientId((prev) => prev || data[0].id);
  }, []);

  useEffect(() => {
    loadClients()
      .catch(() => setError('No se pudieron cargar los clientes'))
      .finally(() => setLoading(false));
  }, [loadClients]);

  useEffect(() => {
    if (!clientId) return;
    apiFetch<SocialAccount[]>(`/social-accounts?clientId=${clientId}`)
      .then((data) => {
        setAccounts(data);
        setSelectedAccounts(data.map((a) => a.id));
      })
      .catch(() => setError('No se pudieron cargar las cuentas sociales'));
  }, [clientId]);

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent, sendToApproval: boolean) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const tagList = hashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    try {
      const post = await apiFetch<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          caption,
          hashtags: tagList,
          socialAccountIds: selectedAccounts,
        }),
      });

      if (sendToApproval) {
        await apiFetch(`/posts/${post.id}/submit-for-approval`, { method: 'POST' });
        setMessage(`Post enviado a aprobación (${post.id.slice(0, 8)}…)`);
      } else {
        setMessage(`Borrador guardado (${post.id.slice(0, 8)}…)`);
      }

      setCaption('');
      setHashtags('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el post');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-slate-400">Cargando composer…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Composer</h1>
        <p className="text-sm text-slate-400">
          Crea un borrador o envíalo directamente a la bandeja de aprobación.
        </p>
      </div>

      <form className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <label htmlFor="client" className="mb-1 block text-sm text-slate-300">
            Cliente
          </label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="caption" className="mb-1 block text-sm text-slate-300">
            Caption
          </label>
          <textarea
            id="caption"
            required
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="Texto del post…"
          />
        </div>

        <div>
          <label htmlFor="hashtags" className="mb-1 block text-sm text-slate-300">
            Hashtags (separados por espacio o coma)
          </label>
          <input
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="#marca #promo"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-slate-300">Destinos</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-500">No hay cuentas conectadas para este cliente.</p>
            ) : (
              accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(a.id)}
                    onChange={() => toggleAccount(a.id)}
                  />
                  {a.platform}
                  {a.username ? ` · ${a.username}` : ''}
                </label>
              ))
            )}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting || selectedAccounts.length === 0}
            onClick={(e) => handleSubmit(e, false)}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            disabled={submitting || selectedAccounts.length === 0}
            onClick={(e) => handleSubmit(e, true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Enviar a aprobación
          </button>
        </div>
      </form>
    </div>
  );
}
