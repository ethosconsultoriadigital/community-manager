'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Client, SocialAccount } from '@/lib/types';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
};

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] ?? platform;
}

export default function CuentasPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = useMemo(
    () => user != null && ['manager', 'admin', 'owner'].includes(user.role),
    [user],
  );

  const loadClients = useCallback(async () => {
    const data = await apiFetch<Client[]>('/clients');
    const active = data.filter((c) => c.is_active);
    setClients(active);
    setClientId((prev) => prev || active[0]?.id || '');
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!clientId) {
      setAccounts([]);
      return;
    }
    const data = await apiFetch<SocialAccount[]>(
      `/social-accounts?clientId=${encodeURIComponent(clientId)}`,
    );
    setAccounts(data);
  }, [clientId]);

  useEffect(() => {
    loadClients()
      .catch(() => setError('No se pudieron cargar los clientes'))
      .finally(() => setLoading(false));
  }, [loadClients]);

  useEffect(() => {
    if (searchParams.get('connected') === 'meta') {
      setMessage('Cuenta Meta conectada correctamente.');
    }
  }, [searchParams]);

  useEffect(() => {
    loadAccounts().catch(() => setError('No se pudieron cargar las cuentas sociales'));
  }, [loadAccounts]);

  async function connectMeta() {
    if (!clientId) return;
    setConnecting(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/oauth/meta/connect-url?clientId=${encodeURIComponent(clientId)}`,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la conexión con Meta');
      setConnecting(false);
    }
  }

  async function disconnectAccount(accountId: string) {
    if (
      !confirm(
        '¿Desconectar esta cuenta? No se podrá publicar en ella hasta volver a conectarla.',
      )
    ) {
      return;
    }
    setDisconnectingId(accountId);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/social-accounts/${accountId}`, { method: 'DELETE' });
      setMessage('Cuenta desconectada.');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo desconectar la cuenta');
    } finally {
      setDisconnectingId(null);
    }
  }

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active !== false),
    [accounts],
  );
  const inactiveAccounts = useMemo(
    () => accounts.filter((a) => a.is_active === false),
    [accounts],
  );

  if (loading) {
    return <p className="text-slate-400">Cargando cuentas…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Cuentas sociales</h1>
        <p className="text-sm text-slate-400">
          Conecta o desconecta cuentas de Facebook e Instagram por cliente.
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
            {clients.length === 0 ? (
              <option value="">Sin clientes</option>
            ) : (
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>
        {canManage && (
          <button
            type="button"
            onClick={connectMeta}
            disabled={!clientId || connecting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {connecting ? 'Redirigiendo…' : 'Conectar Meta'}
          </button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">
          Conectadas ({activeAccounts.length})
        </h2>
        {activeAccounts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay cuentas activas para este cliente.
            {canManage && ' Usa «Conectar Meta» para añadir páginas e Instagram.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {activeAccounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-white">
                    {platformLabel(account.platform)}
                    {account.username ? ` @${account.username}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">ID: {account.external_account_id}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => disconnectAccount(account.id)}
                    disabled={disconnectingId === account.id}
                    className="rounded-md border border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {disconnectingId === account.id ? 'Desconectando…' : 'Desconectar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactiveAccounts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-300">
            Desconectadas ({inactiveAccounts.length})
          </h2>
          <ul className="space-y-2">
            {inactiveAccounts.map((account) => (
              <li
                key={account.id}
                className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-4 py-3"
              >
                <p className="text-sm text-slate-400">
                  {platformLabel(account.platform)}
                  {account.username ? ` @${account.username}` : ''}
                  <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs">
                    Inactiva
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
