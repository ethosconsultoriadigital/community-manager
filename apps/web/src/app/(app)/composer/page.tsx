'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, apiFetch, apiUploadMedia } from '@/lib/api';
import type {
  CanvaStatus,
  Client,
  GenerateFromBriefResult,
  MediaAsset,
  Post,
  SocialAccount,
} from '@/lib/types';

const ACCEPT_MEDIA =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

export default function ComposerPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [clientId, setClientId] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [aiBrief, setAiBrief] = useState('');
  const [canvaStatus, setCanvaStatus] = useState<CanvaStatus | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [openingCanva, setOpeningCanva] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [publishAsReel, setPublishAsReel] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const data = await apiFetch<Client[]>('/clients');
    setClients(data.filter((c) => c.is_active));
    if (data.length > 0) setClientId((prev) => prev || data[0].id);
  }, []);

  useEffect(() => {
    loadClients()
      .catch(() => setError('No se pudieron cargar los clientes'))
      .finally(() => setLoading(false));
  }, [loadClients]);

  const loadCanvaStatus = useCallback(async () => {
    try {
      const status = await apiFetch<CanvaStatus>('/oauth/canva/status');
      setCanvaStatus(status);
    } catch {
      setCanvaStatus(null);
    }
  }, []);

  useEffect(() => {
    loadCanvaStatus();
  }, [loadCanvaStatus]);

  const loadPostIntoForm = useCallback(async (postId: string) => {
    const post = await apiFetch<Post>(`/posts/${postId}`);
    setEditingPostId(post.id);
    setClientId(post.client_id);
    setCaption(post.caption ?? '');
    setHashtags(post.hashtags?.join(' ') ?? '');
    setSelectedAccounts(post.post_targets.map((t) => t.social_accounts.id));
    setPublishAsReel(post.video_format === 'reel');

    const image = post.media_assets?.find((m) => m.type === 'image');
    const video = post.media_assets?.find((m) => m.type === 'video');
    if (image?.storage_url) {
      setAiPreviewUrl(image.storage_url);
      setMediaFile(null);
      setMediaPreview(null);
    } else if (video?.storage_url) {
      setAiPreviewUrl(null);
      setMediaFile(null);
      setMediaPreview(video.storage_url);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('connected') === 'canva') {
      setMessage('Canva conectado correctamente.');
      loadCanvaStatus();
    }

    const canvaError = searchParams.get('canva_error');
    if (canvaError) {
      setError(decodeURIComponent(canvaError));
      return;
    }

    const canvaReturn = searchParams.get('canva_return');
    if (!canvaReturn) return;

    loadPostIntoForm(canvaReturn)
      .then(() => {
        setMessage(
          `Diseño Canva guardado en el post (${canvaReturn.slice(0, 8)}…). Puedes enviarlo a aprobación.`,
        );
      })
      .catch(() => {
        setError('No se pudo cargar el post tras volver de Canva');
      });
  }, [searchParams, loadCanvaStatus, loadPostIntoForm]);

  useEffect(() => {
    if (!clientId) return;
    apiFetch<SocialAccount[]>(`/social-accounts?clientId=${clientId}`)
      .then((data) => {
        const active = data.filter((a) => a.is_active !== false);
        setAccounts(active);
        if (!editingPostId) {
          setSelectedAccounts(active.map((a) => a.id));
        }
      })
      .catch(() => setError('No se pudieron cargar las cuentas sociales'));
  }, [clientId, editingPostId]);

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleMediaChange(file: File | null) {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    if (!file) {
      setMediaPreview(null);
      setPublishAsReel(false);
      return;
    }
    if (!file.type.startsWith('video/')) {
      setPublishAsReel(false);
    }
    setMediaPreview(URL.createObjectURL(file));
  }

  function clearForm() {
    setCaption('');
    setHashtags('');
    setAiBrief('');
    setAiPreviewUrl(null);
    setEditingPostId(null);
    setPublishAsReel(false);
    handleMediaChange(null);
  }

  function hasVideoAttachment(): boolean {
    if (mediaFile?.type.startsWith('video/')) return true;
    return Boolean(mediaPreview && !mediaFile && !aiPreviewUrl);
  }

  function videoFormatPayload(): 'feed' | 'reel' | null {
    if (!hasVideoAttachment()) return null;
    return publishAsReel ? 'reel' : 'feed';
  }

  function parseHashtags(): string[] {
    return hashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
  }

  async function connectCanva() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('/oauth/canva/connect-url');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar conexión con Canva');
    }
  }

  async function handleGenerateWithAi() {
    if (!aiBrief.trim()) {
      setError('Escribe un brief para generar con IA');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos un destino');
      return;
    }

    setError(null);
    setMessage(null);
    setGeneratingAi(true);

    try {
      const result = await apiFetch<GenerateFromBriefResult>('/generations/from-brief', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          brief: aiBrief.trim(),
          socialAccountIds: selectedAccounts,
        }),
      });

      if (result.post.caption) setCaption(result.post.caption);
      if (result.post.hashtags?.length) {
        setHashtags(result.post.hashtags.join(' '));
      }

      const image = result.media.find((m) => m.type === 'image');
      if (image?.storage_url) {
        setAiPreviewUrl(image.storage_url);
        handleMediaChange(null);
      }

      const provider =
        canvaStatus?.connected && canvaStatus.configured ? 'Canva' : 'mock';
      setMessage(
        `Borrador generado con IA (${provider}) y enviado a aprobación (${result.post.id.slice(0, 8)}…)`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar con IA');
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleEditInCanva() {
    if (!caption.trim()) {
      setError('Escribe un caption antes de abrir Canva');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos un destino');
      return;
    }
    if (!canvaStatus?.connected) {
      setError('Conecta Canva primero');
      return;
    }

    setError(null);
    setMessage(null);
    setOpeningCanva(true);

    const tagList = parseHashtags();

    try {
      let postId = editingPostId;

      if (postId) {
        await apiFetch<Post>(`/posts/${postId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            caption,
            hashtags: tagList,
            socialAccountIds: selectedAccounts,
            videoFormat: videoFormatPayload(),
          }),
        });
        if (mediaFile) {
          await apiUploadMedia<MediaAsset>(postId, mediaFile);
        }
      } else {
        const post = await apiFetch<Post>('/posts', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            caption,
            hashtags: tagList,
            socialAccountIds: selectedAccounts,
            videoFormat: videoFormatPayload(),
          }),
        });
        postId = post.id;
        if (mediaFile) {
          await apiUploadMedia<MediaAsset>(postId, mediaFile);
        }
      }

      const { editUrl } = await apiFetch<{ editUrl: string; designId: string }>(
        `/posts/${postId}/canva/edit-url`,
        { method: 'POST' },
      );

      window.location.href = editUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el editor Canva');
      setOpeningCanva(false);
    }
  }

  async function handleSubmit(e: FormEvent, sendToApproval: boolean) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const tagList = parseHashtags();

    try {
      let postId = editingPostId;

      if (postId) {
        await apiFetch<Post>(`/posts/${postId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            caption,
            hashtags: tagList,
            socialAccountIds: selectedAccounts,
            videoFormat: videoFormatPayload(),
          }),
        });
        if (mediaFile) {
          await apiUploadMedia<MediaAsset>(postId, mediaFile);
        }
      } else {
        const post = await apiFetch<Post>('/posts', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            caption,
            hashtags: tagList,
            socialAccountIds: selectedAccounts,
            videoFormat: videoFormatPayload(),
          }),
        });
        postId = post.id;
        if (mediaFile) {
          await apiUploadMedia<MediaAsset>(postId, mediaFile);
        }
      }

      if (sendToApproval) {
        await apiFetch(`/posts/${postId}/submit-for-approval`, { method: 'POST' });
        setMessage(
          `Post enviado a aprobación${mediaFile || aiPreviewUrl ? ' con adjunto' : ''} (${postId.slice(0, 8)}…)`,
        );
        clearForm();
      } else {
        setEditingPostId(postId);
        setMessage(`Borrador guardado (${postId.slice(0, 8)}…)`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el post');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-slate-400">Cargando composer…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Composer</h1>
        <p className="text-sm text-slate-400">
          Crea un borrador o envíalo a aprobación. Puedes adjuntar una imagen o un video.
        </p>
      </div>

      <form className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="rounded-md border border-indigo-900/50 bg-indigo-950/20 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-indigo-200">Generar con IA + Canva</h2>
              <p className="text-xs text-slate-400">
                Crea copy, imagen y flyer (mock o Canva real si está conectado) y envía a
                aprobación.
              </p>
            </div>
            {canvaStatus?.configured && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  canvaStatus.connected
                    ? 'bg-emerald-900/50 text-emerald-300'
                    : 'bg-amber-900/40 text-amber-200'
                }`}
              >
                Canva {canvaStatus.connected ? 'conectado' : 'sin conectar'}
              </span>
            )}
          </div>

          <textarea
            rows={3}
            value={aiBrief}
            onChange={(e) => setAiBrief(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="Brief: promo de verano, tono cercano, CTA reserva…"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generatingAi || submitting || selectedAccounts.length === 0}
              onClick={handleGenerateWithAi}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {generatingAi ? 'Generando…' : 'Generar y enviar a aprobación'}
            </button>
            {canvaStatus?.configured && !canvaStatus.connected && (
              <button
                type="button"
                onClick={connectCanva}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Conectar Canva
              </button>
            )}
          </div>

          {aiPreviewUrl && (
            <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
              <img
                src={aiPreviewUrl}
                alt="Vista previa generada"
                className="max-h-48 w-full rounded object-contain"
              />
              <p className="mt-1 text-xs text-slate-500">Imagen generada (ya guardada en el post)</p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="client" className="mb-1 block text-sm text-slate-300">
            Cliente
          </label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="caption" className="mb-1 block text-sm text-slate-300">
            Caption
          </label>
          <textarea
            id="caption"
            required
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="Texto del post…"
          />
        </div>

        <div>
          <label htmlFor="hashtags" className="mb-1 block text-sm text-slate-300">
            Hashtags (separados por espacio o coma)
          </label>
          <input
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="#marca #promo"
          />
        </div>

        <div>
          <label htmlFor="media" className="mb-1 block text-sm text-slate-300">
            Imagen o video (opcional)
          </label>
          <input
            id="media"
            type="file"
            accept={ACCEPT_MEDIA}
            onChange={(e) => handleMediaChange(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
          <p className="mt-1 text-xs text-slate-500">
            Imágenes hasta 10 MB · Videos hasta 50 MB (JPEG, PNG, WebP, GIF, MP4, MOV, WebM)
          </p>
          {mediaPreview && (
            <div className="mt-3 rounded-md border border-slate-700 bg-slate-900 p-2">
              {hasVideoAttachment() ? (
                <video
                  src={mediaPreview}
                  controls
                  className="max-h-48 w-full rounded object-contain"
                />
              ) : (
                <img
                  src={mediaPreview}
                  alt="Vista previa del adjunto"
                  className="max-h-48 w-full rounded object-contain"
                />
              )}
              {mediaFile && (
                <button
                  type="button"
                  onClick={() => handleMediaChange(null)}
                  className="mt-2 text-xs text-red-400 hover:text-red-300"
                >
                  Quitar adjunto
                </button>
              )}
            </div>
          )}
          {hasVideoAttachment() && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={publishAsReel}
                onChange={(e) => setPublishAsReel(e.target.checked)}
              />
              Publicar como Reel en Instagram
            </label>
          )}
          {hasVideoAttachment() && publishAsReel && (
            <p className="mt-1 text-xs text-slate-500">
              Facebook seguirá recibiendo el video en feed. Solo Instagram usa formato Reel.
            </p>
          )}
        </div>

        {canvaStatus?.configured && canvaStatus.connected && (
          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 space-y-2">
            <h2 className="text-sm font-medium text-slate-200">Editor Canva (manual)</h2>
            <p className="text-xs text-slate-400">
              Guarda un borrador y abre el editor de Canva. Al volver, la imagen exportada se
              adjunta al post.
            </p>
            {editingPostId && (
              <p className="text-xs text-indigo-300">
                Borrador activo: {editingPostId.slice(0, 8)}…
              </p>
            )}
            <button
              type="button"
              disabled={openingCanva || submitting || selectedAccounts.length === 0}
              onClick={handleEditInCanva}
              className="rounded-md border border-indigo-600 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-950 disabled:opacity-50"
            >
              {openingCanva ? 'Abriendo Canva…' : 'Editar en Canva'}
            </button>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm text-slate-300">Destinos</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-500">No hay cuentas conectadas para este cliente.</p>
            ) : (
              accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(a.id)}
                    onChange={() => toggleAccount(a.id)}
                  />
                  {a.platform}
                  {a.username ? ` · ${a.username}` : ''}
                </label>
              ))
            )}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting || selectedAccounts.length === 0}
            onClick={(e) => handleSubmit(e, false)}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            disabled={submitting || selectedAccounts.length === 0}
            onClick={(e) => handleSubmit(e, true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Enviar a aprobación
          </button>
        </div>
      </form>
    </div>
  );
}
