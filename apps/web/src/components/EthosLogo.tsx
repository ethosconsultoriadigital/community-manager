import Link from 'next/link';

type EthosLogoProps = {
  /** Ruta del enlace; `false` = sin enlace (p. ej. footer) */
  href?: string | false;
  compact?: boolean;
};

export function EthosLogo({ href = '/inicio', compact = false }: EthosLogoProps) {
  const img = (
    // img nativo: evita restricciones de next/image con PNG en public/
    <img
      src="/ethos-logo.png"
      alt="Ethos — Consultoría y Estrategia Digital"
      width={compact ? 160 : 280}
      height={compact ? 48 : 84}
      className={`h-auto w-auto object-contain ${compact ? 'max-h-10' : 'max-h-16'}`}
      decoding="async"
    />
  );

  if (href !== false) {
    return (
      <Link href={href} className="inline-block shrink-0" aria-label="Ir a Inicio">
        {img}
      </Link>
    );
  }

  return <span className="inline-block shrink-0">{img}</span>;
}
