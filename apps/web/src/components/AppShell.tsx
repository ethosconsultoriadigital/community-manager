'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EthosLogo } from '@/components/EthosLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/inicio', label: 'Inicio' },
  { href: '/composer', label: 'Composer' },
  { href: '/approvals', label: 'Aprobaciones' },
  { href: '/calendar', label: 'Calendario' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, agencyName, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Cargando…
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <EthosLogo href="/inicio" compact />
            <p className="hidden text-xs text-slate-400 sm:block">{agencyName}</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[140px] truncate text-xs text-slate-400 md:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
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
