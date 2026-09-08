'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { ClientScopeField } from '@/components/ClientScopeField';
import { useAuth } from '@/lib/auth';
import { useAssignedClients } from '@/lib/use-assigned-clients';
import type { SocialAccount } from '@/lib/types';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  x: 'X',
  tiktok: 'TikTok',
};

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] ?? platform;
}

type PlatformFeatures = {
  facebook: boolean;
  instagram: boolean;
  threads: boolean;
  x: boolean;
  tiktok: boolean;
};

export default function CuentasPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: clientsLoading,
    error: clientsError,
  } = useAssignedClients();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [features, setFeatures] = useState<PlatformFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<'meta' | 'threads' | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = useMemo(
    () => user != null && ['manager', 'admin', 'owner'].includes(user.role),
    [user],
  );

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
    if (!clientsLoading) setLoading(false);
  }, [clientsLoading]);

  useEffect(() => {
    if (clientsError) setError(clientsError);
  }, [clientsError]);

  useEffect(() => {
    apiFetch<PlatformFeatures>('/platforms/features')
      .then(setFeatures)
      .catch(() => setFeatures({ facebook: true, instagram: true, threads: false, x: false, tiktok: false }));
  }, []);

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'meta') {
      setMessage('Cuenta Meta conectada correctamente.');
    } else if (connected === 'threads') {
      setMessage('Cuenta Threads conectada correctamente.');
    }
  }, [searchParams]);

  useEffect(() => {
    loadAccounts().catch(() => setError('No se pudieron cargar las cuentas sociales'));
  }, [loadAccounts]);

  async function connectMeta() {
    if (!clientId) return;
    setConnecting('meta');
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/oauth/meta/connect-url?clientId=${encodeURIComponent(clientId)}`,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la conexión con Meta');
      setConnecting(null);
    }
  }

  async function connectThreads() {
    if (!clientId) return;
    setConnecting('threads');
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/oauth/threads/connect-url?clientId=${encodeURIComponent(clientId)}`,
      );
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo iniciar la conexión con Threads',
      );
      setConnecting(null);
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
    return <p className="text-muted">Cargando cuentas…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Cuentas sociales</h1>
        <p className="text-sm text-muted">
          Conecta o desconecta cuentas por cliente (Meta y, si está habilitado, Threads).
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
          selectClassName="rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
        />
        {canManage && (
          <>
            <button
              type="button"
              onClick={connectMeta}
              disabled={!clientId || connecting !== null}
              className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {connecting === 'meta' ? 'Redirigiendo…' : 'Conectar Meta'}
            </button>
            {features?.threads && (
              <button
                type="button"
                onClick={connectThreads}
                disabled={!clientId || connecting !== null}
                className="rounded-md border border-line-strong bg-white px-4 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-50"
              >
                {connecting === 'threads' ? 'Redirigiendo…' : 'Conectar Threads'}
              </button>
            )}
          </>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">
          Conectadas ({activeAccounts.length})
        </h2>
        {activeAccounts.length === 0 ? (
          <p className="text-sm text-muted">
            No hay cuentas activas para este cliente.
            {canManage && ' Usa «Conectar Meta» (o Threads) para añadir destinos.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {activeAccounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm text-ink">
                    {platformLabel(account.platform)}
                    {account.username ? ` @${account.username}` : ''}
                  </p>
                  <p className="text-xs text-muted">ID: {account.external_account_id}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => disconnectAccount(account.id)}
                    disabled={disconnectingId === account.id}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
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
          <h2 className="text-sm font-medium text-muted">
            Desconectadas ({inactiveAccounts.length})
          </h2>
          <ul className="space-y-2">
            {inactiveAccounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-4 py-3"
              >
                <p className="text-sm text-muted">
                  {platformLabel(account.platform)}
                  {account.username ? ` @${account.username}` : ''}
                  <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs">
                    Inactiva
                  </span>
                </p>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      if (account.platform === 'threads') {
                        void connectThreads();
                      } else {
                        void connectMeta();
                      }
                    }}
                    disabled={!clientId || connecting !== null}
                    className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs text-ink hover:bg-surface disabled:opacity-50"
                    title="Hay que volver a autorizar: al desconectar se revoca el token"
                  >
                    {connecting
                      ? 'Redirigiendo…'
                      : account.platform === 'threads'
                        ? 'Volver a conectar Threads'
                        : 'Volver a conectar Meta'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
