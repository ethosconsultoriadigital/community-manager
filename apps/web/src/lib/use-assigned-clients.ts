'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shouldShowClientSelector } from '@/lib/client-scope';
import type { Client } from '@/lib/types';

export function useAssignedClients() {
  const { user, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const data = await apiFetch<Client[]>('/clients');
    const active = data.filter((c) => c.is_active);
    setClients(active);
    setClientId((prev) => {
      if (prev && active.some((c) => c.id === prev)) return prev;
      return active[0]?.id ?? '';
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadClients()
      .catch(() => setError('No se pudieron cargar los clientes'))
      .finally(() => setLoading(false));
  }, [authLoading, loadClients]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const showClientSelector = user
    ? shouldShowClientSelector(user.role, clients.length)
    : clients.length > 1;

  return {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: loading || authLoading,
    error,
    reloadClients: loadClients,
  };
}
