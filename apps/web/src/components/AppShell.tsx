'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EthosLogo } from '@/components/EthosLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/lib/auth';

const BASE_NAV = [
  { href: '/inicio', label: 'Inicio' },
  { href: '/composer', label: 'Composer' },
  { href: '/approvals', label: 'Aprobaciones' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/cuentas', label: 'Cuentas' },
];

const ADMIN_NAV = { href: '/admin', label: 'Admin' };

function isAgencyAdmin(role: string) {
  return role === 'owner' || role === 'admin';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, agencyName, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Cargando…
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  const nav = isAgencyAdmin(user.role) ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <EthosLogo href="/inicio" compact />
            <p className="hidden text-xs text-muted sm:block">{agencyName}</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-brand text-white'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[140px] truncate text-xs text-muted md:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="rounded-md border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas hover:text-ink"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
