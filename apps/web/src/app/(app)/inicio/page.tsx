'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardStatCard, postsForStatus } from '@/components/DashboardStatCard';
import { apiFetch } from '@/lib/api';
import type { Post } from '@/lib/types';

export default function InicioPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiFetch<Post[]>('/posts?withMetrics=1');
    setPosts(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const cards = useMemo(
    () => [
      {
        key: 'pending',
        label: 'Pendientes de aprobación',
        tone: 'pending' as const,
        href: '/approvals',
        posts: postsForStatus(posts, 'pending_approval'),
      },
      {
        key: 'approved',
        label: 'Aprobados sin programar',
        tone: 'approved' as const,
        href: '/approvals',
        posts: postsForStatus(posts, 'approved'),
      },
      {
        key: 'scheduled',
        label: 'Programados',
        tone: 'scheduled' as const,
        href: '/calendar',
        posts: postsForStatus(posts, 'scheduled'),
      },
      {
        key: 'published',
        label: 'Publicados',
        tone: 'published' as const,
        href: '/calendar',
        posts: postsForStatus(posts, 'published'),
      },
    ],
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
          Resumen visual de tu contenido y accesos rápidos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <DashboardStatCard
            key={card.key}
            label={card.label}
            value={card.posts.length}
            href={card.href}
            tone={card.tone}
            previewPosts={card.posts}
          />
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
          href="/radar"
          className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink hover:bg-canvas"
        >
          Conectar fuente
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
