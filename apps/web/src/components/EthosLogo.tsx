'use client';

import Link from 'next/link';

type EthosLogoProps = {
  /** Ruta del enlace; `false` = sin enlace (p. ej. footer) */
  href?: string | false;
  compact?: boolean;
};

/**
 * Logo Ethos en SVG (fondo transparente).
 * Sin caja blanca/azul: se integra en claro y oscuro vía CSS.
 */
export function EthosLogo({ href = '/inicio', compact = false }: EthosLogoProps) {
  const markSize = compact ? 34 : 44;
  const mark = (
    <span
      className={`ethos-logo inline-flex max-w-full items-center ${compact ? 'gap-2' : 'gap-2.5'}`}
    >
      <svg
        className="ethos-logo-svg shrink-0"
        width={markSize}
        height={markSize}
        viewBox="0 0 64 64"
        aria-hidden
      >
        <circle
          className="ethos-mark-stroke"
          cx="32"
          cy="32"
          r="27"
          fill="none"
          strokeWidth="1.6"
        />
        {/* Estrella / rosa de los vientos */}
        <path
          className="ethos-mark-stroke"
          fill="none"
          strokeWidth="1.35"
          strokeLinejoin="round"
          d="M32 6 L36.5 27.5 L58 32 L36.5 36.5 L32 58 L27.5 36.5 L6 32 L27.5 27.5 Z"
        />
        <path
          className="ethos-mark-stroke"
          fill="none"
          strokeWidth="1"
          strokeLinejoin="round"
          opacity="0.45"
          d="M32 12 L34.8 29.2 L52 32 L34.8 34.8 L32 52 L29.2 34.8 L12 32 L29.2 29.2 Z"
        />
        {/* Arcos tipo ojo (acento brand) */}
        <path
          className="ethos-mark-accent"
          fill="none"
          strokeWidth="2.1"
          strokeLinecap="round"
          d="M16 32 Q32 20 48 32"
        />
        <path
          className="ethos-mark-accent"
          fill="none"
          strokeWidth="2.1"
          strokeLinecap="round"
          d="M16 32 Q32 44 48 32"
        />
      </svg>

      <span className="flex min-w-0 flex-col justify-center leading-none">
        <span
          className={`ethos-wordmark font-[family-name:var(--font-landing-display)] font-semibold tracking-[0.06em] ${
            compact ? 'text-[1.05rem]' : 'text-[1.4rem]'
          }`}
        >
          ETHOS
        </span>
        <span
          className={`ethos-tagline mt-1.5 border-b border-current/40 pb-0.5 font-medium uppercase tracking-[0.14em] ${
            compact ? 'max-w-[11.5rem] text-[0.48rem] leading-snug' : 'text-[0.55rem]'
          }`}
        >
          Consultoría y estrategia digital
        </span>
      </span>
      <span className="sr-only">Ethos — Consultoría y Estrategia Digital</span>
    </span>
  );

  if (href !== false) {
    return (
      <Link
        href={href}
        className="ethos-logo-link inline-flex shrink-0 items-center rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        aria-label="Ir a Inicio"
      >
        {mark}
      </Link>
    );
  }

  return <span className="inline-flex shrink-0 items-center">{mark}</span>;
}
