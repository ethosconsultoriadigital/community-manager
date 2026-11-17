'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/** Título principal de módulo — tipografía display, borde inferior. */
export function PageHeader({
  title,
  description,
  helpSection,
}: {
  title: string;
  description?: ReactNode;
  /** Ancla de la Guía (p. ej. «composer») — muestra un botón «?» que lleva a /guia#ancla. */
  helpSection?: string;
}) {
  return (
    <header className="border-b border-line pb-4">
      <div className="flex items-center gap-2">
        <h1 className="font-[family-name:var(--font-landing-display)] text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {helpSection ? (
          <Link
            href={`/guia#${helpSection}`}
            title="Ayuda: cómo usar esta pantalla"
            aria-label={`Ayuda sobre ${title} en la Guía`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-bold text-muted hover:border-brand hover:text-brand"
          >
            ?
          </Link>
        ) : null}
      </div>
      {description ? (
        <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          {description}
        </div>
      ) : null}
    </header>
  );
}

/** Título de sección dentro de un módulo (p. ej. «1. Cliente y redes»). */
export function SectionHeading({
  children,
  step,
  id,
}: {
  children: ReactNode;
  step?: string | number;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className="flex items-center gap-2.5 font-[family-name:var(--font-landing-display)] text-base font-semibold tracking-tight text-ink"
    >
      {step != null && step !== '' ? (
        <span
          className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-brand/15 px-1.5 text-xs font-bold text-brand"
          aria-hidden
        >
          {step}
        </span>
      ) : null}
      <span className="border-b-2 border-brand/40 pb-0.5">{children}</span>
    </h2>
  );
}
