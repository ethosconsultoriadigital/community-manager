import { EthosLogo } from './EthosLogo';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-800 bg-slate-900/50">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex w-full flex-col items-center gap-4">
          <EthosLogo href={false} compact />
          <div className="flex w-full flex-col items-center gap-2 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="font-medium text-slate-400">Community Manager Automático</p>
            <p>Consultoría y Estrategia Digital</p>
            <p>© {year} Ethos</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
