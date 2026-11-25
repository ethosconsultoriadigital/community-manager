'use client';

import { useState, type InputHTMLAttributes } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Clases del contenedor (p. ej. «mt-1»). */
  wrapperClassName?: string;
};

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4 10.5 7-0.5 1-1.2 2-2.1 2.9" />
          <path d="M6.7 6.7C4.8 8 3.4 9.8 2 12c1.5 3 5.5 7 10.5 7 1.6 0 3.1-.4 4.4-1" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** Campo de contraseña con botón para mostrar u ocultar lo escrito. */
export function PasswordInput({
  className,
  wrapperClassName,
  style,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';

  return (
    <div className={`relative w-full ${wrapperClassName ?? ''}`.trim()}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ paddingRight: '2.5rem', ...style }}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        title={label}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset"
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}
