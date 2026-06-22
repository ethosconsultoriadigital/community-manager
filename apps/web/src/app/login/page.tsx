'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EthosLogo } from '@/components/EthosLogo';
import { LoginForm } from '@/components/LoginForm';
import { SiteFooter } from '@/components/SiteFooter';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/inicio');
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Cargando…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <EthosLogo href={false} />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-300">Community Manager Automático</p>
          <p className="mt-1 text-xs text-slate-500">Inicia sesión para gestionar contenido</p>
        </div>
        <LoginForm />
      </main>
      <SiteFooter />
    </div>
  );
}
