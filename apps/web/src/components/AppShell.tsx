'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EthosLogo } from '@/components/EthosLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/lib/auth';

const BASE_NAV = [
  { href: '/inicio', label: 'Inicio' },
  { href: '/composer', label: 'Generar Contenido' },
  { href: '/radar', label: 'Conectar fuente' },
  { href: '/approvals', label: 'Aprobaciones' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/cuentas', label: 'Cuentas' },
  { href: '/perfil', label: 'Perfil' },
];

const ADMIN_NAV = { href: '/admin', label: 'Admin' };

function isAgencyAdmin(role: string) {
  return role === 'owner' || role === 'admin';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

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
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex shrink-0 items-center gap-3">
            <EthosLogo href="/inicio" compact />
            <p className="hidden text-xs text-muted xl:block">
              {user.fullName?.trim() || user.email}
            </p>
          </div>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-brand text-white'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2 border-l border-line pl-3">
            <span className="hidden max-w-[160px] truncate text-xs text-muted lg:inline">
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
