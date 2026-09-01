'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EthosCredit } from '@/components/EthosCredit';
import { EthosLogo } from '@/components/EthosLogo';
import { LoginForm } from '@/components/LoginForm';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/inicio');
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] text-[#65676B]">
        Cargando…
      </div>
    );
  }

  return (
    <div className="landing-root flex min-h-screen flex-col bg-[#F0F2F5] text-[#1C1E21]">
      <header className="border-b border-[#E4E6EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <EthosLogo href="/" compact />
          <Link
            href="/"
            className="text-sm font-medium text-[#1877F2] hover:underline"
          >
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="w-full max-w-sm rounded-lg border border-[#E4E6EB] bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <EthosLogo href={false} compact />
            <div>
              <p className="text-lg font-bold text-[#1C1E21]">Community Manager</p>
              <p className="mt-1 text-sm text-[#65676B]">Inicia sesión para gestionar contenido</p>
            </div>
          </div>
          <LoginForm />
        </div>
      </main>

      <footer className="border-t border-[#E4E6EB] bg-white py-4 text-center">
        <EthosCredit className="text-xs text-[#65676B]" />
      </footer>
    </div>
  );
}
