'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageTypography';
import { normalizeForSearch, type GuiaDocument } from '@/lib/guia-markdown';

/** PDF generado con `pnpm guia:pdf` (scripts/guia-pdf.ts) a partir de la misma guía. */
const PDF_HREF = '/guia/Guia-Community-Manager.pdf';

export function GuiaView({ doc }: { doc: GuiaDocument }) {
  const [query, setQuery] = useState('');

  const terms = useMemo(
    () =>
      normalizeForSearch(query)
        .split(/\s+/)
        .filter((t) => t.length > 1),
    [query],
  );
  const visible = useMemo(
    () =>
      terms.length === 0
        ? doc.sections
        : doc.sections.filter((s) => terms.every((t) => s.searchText.includes(t))),
    [doc.sections, terms],
  );

  // Al llegar desde un botón «?» (/guia#seccion), asegurar el desplazamiento al ancla.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guía"
        description="Manual de uso de la plataforma, paso a paso. Busca un tema o usa el índice."
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en la guía (p. ej. Threads, avatar, programar)…"
          aria-label="Buscar en la guía"
          className="w-full max-w-md rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <a
          href={PDF_HREF}
          download
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Descargar guía en PDF
        </a>
      </div>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          aria-label="Índice de la guía"
          className="lg:sticky lg:top-4 lg:self-start"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Índice
          </p>
          <ol className="space-y-1 text-sm">
            {visible.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="font-medium text-ink hover:text-brand">
                  {s.title}
                </a>
                {terms.length === 0 && s.children.length > 0 ? (
                  <ul className="mt-1 mb-2 space-y-0.5 border-l border-line pl-3 text-xs">
                    {s.children.map((c) => (
                      <li key={c.id}>
                        <a href={`#${c.id}`} className="text-muted hover:text-brand">
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-10">
          {terms.length === 0 ? (
            <div
              className="guia-content"
              dangerouslySetInnerHTML={{ __html: doc.introHtml }}
            />
          ) : (
            <p className="text-sm text-muted">
              {visible.length === 0
                ? 'No encontramos ese tema. Prueba con otra palabra.'
                : `${visible.length} sección(es) con «${query.trim()}».`}
            </p>
          )}
          {visible.map((s) => (
            <section
              key={s.id}
              className="guia-content scroll-mt-4 rounded-xl border border-line bg-surface p-5"
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          ))}
          <p className="text-sm text-muted">
            ¿Dudas que no están aquí? Escríbele a Ethos.{' '}
            <Link href="/inicio" className="text-brand hover:underline">
              Volver a Inicio
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
