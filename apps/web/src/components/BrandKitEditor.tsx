'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiFetch, apiUploadClientLogoVariant } from '@/lib/api';
import {
  AVATAR_TEMPLATE_OPTIONS,
  BRAND_FONT_OPTIONS,
  readVideoTemplate,
  type AvatarTemplateValue,
} from '@/lib/brand-kit';
import type { Client } from '@/lib/types';

type Props = {
  client: Client;
  onSaved: (brand: Record<string, unknown>) => void;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rec(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const inputClass =
  'mt-1 w-full rounded-md border border-line-strong bg-white px-2 py-1.5 text-sm text-ink';

/**
 * Kit de marca del cliente: colores, fuentes, web, CTA, usuario, variantes de
 * logo y plantilla de video por defecto. El logo principal se sube en el
 * Composer como siempre; aquí no se toca.
 */
export function BrandKitEditor({ client, onSaved }: Props) {
  const brand = rec(client.brand);
  const [dark, setDark] = useState('');
  const [primary, setPrimary] = useState('');
  const [accent, setAccent] = useState('');
  const [fontTitle, setFontTitle] = useState('');
  const [fontBody, setFontBody] = useState('');
  const [website, setWebsite] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [handle, setHandle] = useState('');
  const [videoTemplate, setVideoTemplate] =
    useState<AvatarTemplateValue>('profesional');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'dark' | 'light' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colors = rec(brand.colors);
    const fonts = rec(brand.fonts);
    setDark(str(colors.dark));
    setPrimary(str(colors.primary));
    setAccent(str(colors.accent));
    setFontTitle(str(fonts.title));
    setFontBody(str(fonts.body));
    setWebsite(str(brand.website));
    setCtaText(str(brand.ctaText));
    setHandle(str(brand.handle));
    setVideoTemplate(readVideoTemplate(brand));
  }, [client.id, client.brand]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    for (const [label, value] of [
      ['Color oscuro', dark],
      ['Color principal', primary],
      ['Color de acento', accent],
    ] as const) {
      if (value && !HEX.test(value)) {
        setError(`${label}: usa el formato #RRGGBB`);
        return;
      }
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ brand: Record<string, unknown> }>(
        `/clients/${client.id}/brand-kit`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            colors: { dark, primary, accent },
            fonts: { title: fontTitle, body: fontBody },
            website,
            ctaText,
            handle,
            videoTemplate,
          }),
        },
      );
      onSaved(result.brand);
      setMessage('Kit de marca guardado');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el Kit de marca',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleVariant(variant: 'dark' | 'light', file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setUploading(variant);
    try {
      const result = await apiUploadClientLogoVariant(client.id, variant, file);
      onSaved(result.brand);
      setMessage(
        variant === 'dark'
          ? 'Logo para fondo oscuro guardado'
          : 'Logo para fondo claro guardado',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el logo');
    } finally {
      setUploading(null);
    }
  }

  async function clearVariant(key: 'logoDarkUrl' | 'logoLightUrl') {
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ brand: Record<string, unknown> }>(
        `/clients/${client.id}/brand-kit`,
        { method: 'PATCH', body: JSON.stringify({ [key]: '' }) },
      );
      onSaved(result.brand);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar el logo');
    }
  }

  const colorField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    placeholder: string,
  ) => (
    <label className="block text-xs">
      <span className="text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={HEX.test(value) ? value : placeholder}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="h-8 w-10 cursor-pointer rounded border border-line-strong bg-white"
        />
        <input
          type="text"
          value={value}
          placeholder={`${placeholder} (auto)`}
          onChange={(e) => setValue(e.target.value.trim())}
          className="w-full rounded-md border border-line-strong bg-white px-2 py-1.5 text-sm text-ink"
        />
      </div>
    </label>
  );

  const logoDarkUrl = str(brand.logoDarkUrl);
  const logoLightUrl = str(brand.logoLightUrl);

  return (
    <form
      onSubmit={handleSave}
      className="mt-3 space-y-4 rounded-md border border-line bg-canvas p-3"
    >
      <div>
        <h3 className="text-sm font-medium text-ink">Kit de marca</h3>
        <p className="text-xs text-muted">
          Se usa en los videos de avatar con plantilla. Si dejas los colores vacíos, se
          sacan del logo automáticamente. El logo nunca se recorta ni se modifica.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {colorField('Color oscuro (fondo)', dark, setDark, '#0F172A')}
        {colorField('Color principal', primary, setPrimary, '#1E3A5F')}
        {colorField('Color de acento', accent, setAccent, '#38BDF8')}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-muted">Fuente de títulos</span>
          <select
            value={fontTitle}
            onChange={(e) => setFontTitle(e.target.value)}
            className={inputClass}
          >
            <option value="">Poppins (por defecto)</option>
            {BRAND_FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted">Fuente de textos y subtítulos</span>
          <select
            value={fontBody}
            onChange={(e) => setFontBody(e.target.value)}
            className={inputClass}
          >
            <option value="">Poppins (por defecto)</option>
            {BRAND_FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="text-muted">Sitio web</span>
          <input
            type="text"
            value={website}
            placeholder="tumarca.com"
            maxLength={120}
            onChange={(e) => setWebsite(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted">Llamado a la acción (cierre)</span>
          <input
            type="text"
            value={ctaText}
            placeholder="Contáctanos"
            maxLength={60}
            onChange={(e) => setCtaText(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted">Usuario en redes (opcional)</span>
          <input
            type="text"
            value={handle}
            placeholder="@tumarca"
            maxLength={60}
            onChange={(e) => setHandle(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-xs">
        <span className="text-muted">Plantilla de video por defecto (avatar)</span>
        <select
          value={videoTemplate}
          onChange={(e) => setVideoTemplate(e.target.value as AvatarTemplateValue)}
          className={inputClass}
        >
          {AVATAR_TEMPLATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.hint}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            [
              'dark',
              'Logo para fondo oscuro (PNG transparente, opcional)',
              logoDarkUrl,
              'logoDarkUrl',
            ],
            ['light', 'Logo para fondo claro (opcional)', logoLightUrl, 'logoLightUrl'],
          ] as const
        ).map(([variant, label, url, key]) => (
          <div key={variant} className="text-xs">
            <span className="text-muted">{label}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading !== null}
              onChange={(e) => void handleVariant(variant, e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white"
            />
            {uploading === variant && <p className="mt-1 text-brand">Subiendo…</p>}
            {url && (
              <div
                className={`mt-2 flex items-center gap-3 rounded p-2 ${variant === 'dark' ? 'bg-slate-800' : 'bg-white'}`}
              >
                <img
                  src={url}
                  alt={label}
                  className="max-h-12 max-w-[160px] object-contain"
                />
                <button
                  type="button"
                  onClick={() => void clearVariant(key)}
                  className="rounded border border-red-200 bg-white px-2 py-0.5 text-red-700 hover:bg-red-50"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
      {message && <p className="text-xs text-green-700">{message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar Kit de marca'}
      </button>
    </form>
  );
}
