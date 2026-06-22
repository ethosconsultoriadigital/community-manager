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
    return <p className="text-slate-400">Cargando…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Inicio</h1>
        <p className="text-sm text-slate-400">
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
            className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-indigo-800 hover:bg-slate-900"
          >
            <p className="text-2xl font-semibold text-white">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/composer"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Crear contenido
        </Link>
        <Link
          href="/approvals"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Ir a aprobaciones
        </Link>
      </div>
    </div>
  );
}
