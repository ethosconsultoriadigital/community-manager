'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EthosLogo } from '@/components/EthosLogo';

const NAV_LINKS = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#como-funciona', label: 'Cómo funciona' },
];

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background,box-shadow] duration-300 ${
        scrolled
          ? 'border-b border-line bg-surface/95 shadow-sm backdrop-blur'
          : 'border-b border-transparent bg-surface/90 backdrop-blur'
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <EthosLogo href="/" compact />

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors hover:text-brand"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover active:bg-brand-active"
          >
            Iniciar sesión
          </Link>
        </nav>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-line-strong px-3 py-2 text-sm text-ink md:hidden"
          aria-expanded={open}
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          Menú
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
