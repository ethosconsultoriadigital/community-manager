'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function LoginFormInner() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetOk = searchParams.get('reset') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {resetOk && (
        <p className="text-sm text-emerald-600">
          Contraseña restablecida. Ya puedes iniciar sesión.
        </p>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#1C1E21]">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-[#CCD0D5] bg-white px-3 py-2 text-sm text-[#1C1E21] outline-none focus:border-[#1877F2] focus:ring-2 focus:ring-[#1877F2]/30"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-[#1C1E21]">
            Contraseña
          </label>
          <Link href="/forgot-password" className="text-xs text-brand hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-[#CCD0D5] bg-white px-3 py-2 text-sm text-[#1C1E21] outline-none focus:border-[#1877F2] focus:ring-2 focus:ring-[#1877F2]/30"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover active:bg-brand-active disabled:opacity-50"
      >
        {submitting ? 'Entrando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
      <LoginFormInner />
    </Suspense>
  );
}
