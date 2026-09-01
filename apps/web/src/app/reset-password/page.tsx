'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { EthosCredit } from '@/components/EthosCredit';
import { EthosLogo } from '@/components/EthosLogo';
import { ApiError, apiFetch } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      router.replace('/login?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        Enlace inválido. Solicita uno nuevo desde{' '}
        <Link href="/forgot-password" className="text-brand hover:underline">
          olvidé mi contraseña
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Nueva contraseña</span>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Confirmar contraseña</span>
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : 'Restablecer contraseña'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl px-4 py-3">
          <EthosLogo href="/login" compact />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6 rounded-lg border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <EthosLogo href={false} compact />
            <div>
              <h1 className="text-xl font-semibold text-ink">Nueva contraseña</h1>
              <p className="mt-1 text-sm text-muted">
                Elige una contraseña de al menos 8 caracteres.
              </p>
            </div>
          </div>
          <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
            <ResetPasswordForm />
          </Suspense>
          <p className="text-center text-sm text-muted">
            <Link href="/login" className="text-brand hover:underline">
              Volver al inicio de sesión
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-surface py-4 text-center">
        <EthosCredit />
      </footer>
    </div>
  );
}
