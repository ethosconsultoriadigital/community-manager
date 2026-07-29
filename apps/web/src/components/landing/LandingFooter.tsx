import { EthosLogo } from '@/components/EthosLogo';

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <EthosLogo href="/" compact />
          <div className="space-y-1 text-sm text-muted">
            <p className="font-semibold text-ink">Community Manager Automático</p>
            <p>Consultoría y Estrategia Digital · Ethos</p>
            <p className="text-xs">© {year} Ethos. Multi-tenant para agencias y marcas.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <a href="#servicios" className="font-medium text-brand hover:underline">
              Servicios
            </a>
            <a href="/login" className="font-medium text-brand hover:underline">
              Iniciar sesión
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
