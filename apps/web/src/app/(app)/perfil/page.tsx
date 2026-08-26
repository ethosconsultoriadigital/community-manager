'use client';

import { FormEvent, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function PerfilPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Contraseña actualizada correctamente');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Mi perfil</h1>
        <p className="text-sm text-muted">Cuenta: {user?.email}</p>
      </div>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Cambiar contraseña</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">Contraseña actual</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Nueva contraseña</span>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Confirmar nueva contraseña</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          {message && <p className="text-sm text-emerald-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Actualizar contraseña'}
          </button>
        </form>
      </section>
    </div>
  );
}
