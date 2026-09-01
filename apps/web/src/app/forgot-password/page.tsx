'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { EthosCredit } from '@/components/EthosCredit';
import { EthosLogo } from '@/components/EthosLogo';
import { ApiError, apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage(
        'Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar la solicitud');
    } finally {
      setSubmitting(false);
    }
  }

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
              <h1 className="text-xl font-semibold text-ink">Olvidé mi contraseña</h1>
              <p className="mt-1 text-sm text-muted">
                Te enviaremos un enlace para elegir una nueva contraseña.
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
              />
            </label>
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
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
