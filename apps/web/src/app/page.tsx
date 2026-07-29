'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingServices } from '@/components/landing/LandingServices';
import { LANDING_STEPS } from '@/lib/landing-services';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/inicio');
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        Cargando…
      </div>
    );
  }

  return (
    <div className="landing-root flex min-h-screen flex-col bg-surface text-ink">
      <LandingNavbar />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden border-b border-line">
          <div className="absolute inset-0 -z-10 landing-hero-bg" aria-hidden />
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2 lg:gap-12">
            <div>
              <p className="landing-fade-up text-sm font-semibold uppercase tracking-[0.2em] text-brand">
                Ethos · Community Manager
              </p>
              <h1 className="landing-fade-up mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                Community Manager Automático
              </h1>
              <p
                className="landing-fade-up mt-5 text-lg leading-relaxed text-muted"
                style={{ animationDelay: '80ms' }}
              >
                La plataforma multi-cliente para planificar, aprobar y publicar en redes
                sociales con apoyo de inteligencia artificial, control humano y métricas
                claras.
              </p>
              <div
                className="landing-fade-up mt-8 flex flex-wrap gap-3"
                style={{ animationDelay: '140ms' }}
              >
                <Link
                  href="/login"
                  className="rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover active:bg-brand-active"
                >
                  Iniciar sesión
                </Link>
                <a
                  href="#servicios"
                  className="rounded-md border border-line-strong bg-surface px-6 py-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
                >
                  Ver servicios
                </a>
              </div>
            </div>
            <div
              className="landing-fade-up overflow-hidden rounded-2xl border border-line shadow-md"
              style={{ animationDelay: '100ms' }}
            >
              <img
                src="/landing/hero.jpg"
                alt="Equipo de agencia gestionando contenido en redes sociales"
                className="aspect-[16/11] w-full object-cover"
              />
            </div>
          </div>
        </section>

        <LandingServices />

        <section
          id="como-funciona"
          className="scroll-mt-20 border-t border-line bg-canvas py-16 sm:py-20"
        >
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Flujo de trabajo
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Cómo funciona
            </h2>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Tres pasos claros para operar varias marcas sin perder control.
            </p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {LANDING_STEPS.map((item) => (
                <li
                  key={item.step}
                  className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                      {item.step}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-12">
              <Link
                href="/login"
                className="inline-flex rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
              >
                Entrar al panel
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
