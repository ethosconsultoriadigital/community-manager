'use client';

import type { ReactNode } from 'react';

/** Tooltip nativo accesible (title) + pista visual opcional. */
export function WithTooltip({
  tip,
  children,
  className,
}: {
  tip: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className} title={tip}>
      {children}
    </span>
  );
}
