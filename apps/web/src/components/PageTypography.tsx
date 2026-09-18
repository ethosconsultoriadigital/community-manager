'use client';

import type { ReactNode } from 'react';

/** Título principal de módulo — tipografía display, borde inferior. */
export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <header className="border-b border-line pb-4">
      <h1 className="font-[family-name:var(--font-landing-display)] text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
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
