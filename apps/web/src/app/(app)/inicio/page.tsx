'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Post } from '@/lib/types';

export default function InicioPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiFetch<Post[]>('/posts');
    setPosts(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const counts = useMemo(
    () => ({
      pending: posts.filter((p) => p.status === 'pending_approval').length,
      approved: posts.filter((p) => p.status === 'approved').length,
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      published: posts.filter((p) => p.status === 'published').length,
    }),
    [posts],
  );

  if (loading) {
    return <p className="text-muted">Cargando…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Inicio</h1>
        <p className="text-sm text-muted">
          Resumen de tu contenido y accesos rápidos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Pendientes de aprobación', value: counts.pending, href: '/approvals' },
          { label: 'Aprobados sin programar', value: counts.approved, href: '/approvals' },
          { label: 'Programados', value: counts.scheduled, href: '/calendar' },
          { label: 'Publicados', value: counts.published, href: '/calendar' },
        ].map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-white"
          >
            <p className="text-2xl font-semibold text-ink">{card.value}</p>
            <p className="mt-1 text-xs text-muted">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/composer"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Crear contenido
        </Link>
        <Link
          href="/approvals"
          className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink hover:bg-canvas"
        >
          Ir a aprobaciones
        </Link>
      </div>
    </div>
  );
}
