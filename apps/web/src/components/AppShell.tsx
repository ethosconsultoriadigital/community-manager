'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EthosLogo } from '@/components/EthosLogo';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

type NavItem = { href: string; label: string; tip: string };

type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Resumen',
    items: [
      {
        href: '/inicio',
        label: 'Inicio',
        tip: 'Resumen de pendientes, aprobados, programados y publicados',
      },
      {
        href: '/guia',
        label: 'Guía',
        tip: 'Ayuda de solo lectura: qué hace cada módulo',
      },
    ],
  },
  {
    id: 'create',
    label: 'Crear',
    items: [
      {
        href: '/composer',
        label: 'Generar Contenido',
        tip: 'Crear posts con IA, archivo o biblioteca y enviar a aprobación',
      },
      {
        href: '/biblioteca',
        label: 'Biblioteca',
        tip: 'Textos e imágenes reutilizables',
      },
      {
        href: '/radar',
        label: 'Conectar fuente',
        tip: 'Radar / Sheets: importar ideas y promover a pendientes',
      },
    ],
  },
  {
    id: 'review',
    label: 'Revisar',
    items: [
      {
        href: '/approvals',
        label: 'Aprobaciones',
        tip: 'Revisar, editar, aprobar o rechazar; programar fecha',
      },
      {
        href: '/calendar',
        label: 'Calendario',
        tip: 'Ver programados y publicados; editar o desprogramar',
      },
      {
        href: '/reportes',
        label: 'Reportes',
        tip: 'Métricas de publicaciones y exportación',
      },
    ],
  },
  {
    id: 'account',
    label: 'Cuenta',
    items: [
      {
        href: '/cuentas',
        label: 'Cuentas',
        tip: 'Conectar o desconectar redes del cliente',
      },
      {
        href: '/perfil',
        label: 'Perfil',
        tip: 'Datos de tu usuario y preferencias',
      },
    ],
  },
];

const ADMIN_ITEM: NavItem = {
  href: '/admin',
  label: 'Admin',
  tip: 'Administrar clientes y usuarios de la agencia',
};

function isAgencyAdmin(role: string) {
  return role === 'owner' || role === 'admin';
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      title={item.tip}
      onClick={onNavigate}
      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-brand font-medium text-white'
          : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

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

  const groups = isAgencyAdmin(user.role)
    ? [
        ...NAV_GROUPS.slice(0, -1),
        {
          ...NAV_GROUPS[NAV_GROUPS.length - 1],
          items: [...NAV_GROUPS[NAV_GROUPS.length - 1].items, ADMIN_ITEM],
        },
      ]
    : NAV_GROUPS;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <EthosLogo href="/inicio" compact />
        <p className="mt-2 truncate text-xs text-muted">
          {user.fullName?.trim() || user.email}
        </p>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-line p-3">
        <button
          type="button"
          title={
            theme === 'dark'
              ? 'Cambiar a tema claro'
              : 'Cambiar a tema oscuro'
          }
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-lg border border-line-strong px-3 py-2 text-sm text-ink hover:bg-canvas"
        >
          <span>Tema</span>
          <span className="text-xs text-muted">
            {theme === 'dark' ? 'Oscuro' : 'Claro'}
          </span>
        </button>
        <button
          type="button"
          title="Cerrar sesión"
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-muted hover:bg-canvas hover:text-ink"
        >
          Salir
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 z-50 w-[min(100%,18rem)] bg-surface shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            title="Abrir menú de navegación"
            aria-expanded={mobileOpen}
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-line-strong px-2.5 py-2 text-ink hover:bg-canvas"
          >
            <span className="sr-only">Menú</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M3 5h14v1.5H3V5zm0 4.25h14v1.5H3v-1.5zM3 13.5h14V15H3v-1.5z" />
            </svg>
          </button>
          <EthosLogo href="/inicio" compact />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              onClick={toggleTheme}
              className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-muted hover:bg-canvas hover:text-ink"
            >
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
