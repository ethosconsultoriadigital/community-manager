'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, apiFetch, apiUploadMedia } from '@/lib/api';
import type {
  Client,
  GenerateFromBriefResult,
  MediaAsset,
  Post,
  SocialAccount,
} from '@/lib/types';

const ACCEPT_MEDIA =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

type MediaMode = 'ai' | 'upload' | 'reel';

export default function ComposerPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [clientId, setClientId] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [aiBrief, setAiBrief] = useState('');
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaMode, setMediaMode] = useState<MediaMode>('upload');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
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
      setMediaMode(image.source === 'ai_generated' ? 'ai' : 'upload');
    } else if (video?.storage_url) {
      setAiPreviewUrl(null);
      setMediaFile(null);
      setMediaPreview(video.storage_url);
      setMediaMode(post.video_format === 'reel' ? 'reel' : 'upload');
    }
  }, []);

  useEffect(() => {
    const canvaReturn = searchParams.get('canva_return');
    if (canvaReturn) {
      loadPostIntoForm(canvaReturn)
        .then(() => {
          setMessage(
            `Post cargado (${canvaReturn.slice(0, 8)}…). Puedes enviarlo a aprobación.`,
          );
        })
        .catch(() => setError('No se pudo cargar el post'));
    }
  }, [searchParams, loadPostIntoForm]);

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
    if (mediaPreview?.startsWith('blob:')) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setAiPreviewUrl(null);
    if (!file) {
      setMediaPreview(null);
      if (mediaMode === 'reel') setPublishAsReel(true);
      else setPublishAsReel(false);
      return;
    }
    const isVideo = file.type.startsWith('video/');
    if (mediaMode === 'reel' && !isVideo) {
      setError('Para Reel sube un video (MP4, MOV o WebM)');
      setMediaPreview(null);
      setMediaFile(null);
      return;
    }
    setPublishAsReel(mediaMode === 'reel' || (isVideo && publishAsReel));
    setMediaPreview(URL.createObjectURL(file));
  }

  function selectMediaMode(mode: MediaMode) {
    setMediaMode(mode);
    setError(null);
    setMessage(null);
    if (mode === 'ai') {
      handleMediaChange(null);
      setPublishAsReel(false);
    } else if (mode === 'reel') {
      setAiPreviewUrl(null);
      setPublishAsReel(true);
      if (mediaFile && !mediaFile.type.startsWith('video/')) {
        handleMediaChange(null);
      }
    } else {
      setAiPreviewUrl(null);
      if (!mediaFile?.type.startsWith('video/')) {
        setPublishAsReel(false);
      }
    }
  }

  function clearForm() {
    setCaption('');
    setHashtags('');
    setAiBrief('');
    setAiPreviewUrl(null);
    setEditingPostId(null);
    setPublishAsReel(mediaMode === 'reel');
    handleMediaChange(null);
  }

  function hasVideoAttachment(): boolean {
    if (mediaFile?.type.startsWith('video/')) return true;
    return Boolean(mediaPreview && !mediaFile && !aiPreviewUrl);
  }

  function videoFormatPayload(): 'feed' | 'reel' | null {
    if (!hasVideoAttachment()) return null;
    return publishAsReel || mediaMode === 'reel' ? 'reel' : 'feed';
  }

  function parseHashtags(): string[] {
    return hashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
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

      setMessage(
        `Copy + imagen generados con IA y enviados a aprobación (${result.post.id.slice(0, 8)}…)`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar con IA');
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleSubmit(e: FormEvent, sendToApproval: boolean) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (mediaMode === 'reel' && !hasVideoAttachment() && !mediaFile) {
      setError('Para Reel adjunta un video');
      return;
    }
    if (mediaMode === 'upload' && !mediaFile && !aiPreviewUrl && !mediaPreview) {
      // adjunto opcional en upload/feed
    }

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
          `Post enviado a aprobación${mediaFile || aiPreviewUrl ? ' con media' : ''} (${postId.slice(0, 8)}…)`,
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
    return <p className="text-muted">Cargando composer…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Composer</h1>
        <p className="text-sm text-muted">
          Elige cómo quieres el media: generar imagen con IA, subir un archivo o publicar un Reel.
        </p>
      </div>

      <form className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <p className="mb-2 text-sm text-muted">Media de la publicación</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'ai', label: 'Generar imagen (IA)' },
                { id: 'upload', label: 'Subir archivo' },
                { id: 'reel', label: 'Reel (video)' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectMediaMode(option.id)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  mediaMode === option.id
                    ? 'bg-brand text-white'
                    : 'border border-line-strong text-muted hover:bg-canvas'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {mediaMode === 'ai' && (
          <div className="rounded-md border border-brand/30 bg-[#E7F3FF] p-4 space-y-3">
            <div>
              <h2 className="text-sm font-medium text-brand">Generar copy + imagen</h2>
              <p className="text-xs text-muted">
                Usa OpenAI Images si hay <code className="text-muted">IMAGE_API_KEY</code>; si
                no, mock local. No depende de Canva.
              </p>
            </div>

            <textarea
              rows={3}
              value={aiBrief}
              onChange={(e) => setAiBrief(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
              placeholder="Brief: promo de verano, tono cercano, CTA reserva…"
            />

            <button
              type="button"
              disabled={generatingAi || submitting || selectedAccounts.length === 0}
              onClick={handleGenerateWithAi}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {generatingAi ? 'Generando…' : 'Generar y enviar a aprobación'}
            </button>

            {aiPreviewUrl && (
              <div className="rounded-md border border-line-strong bg-white p-2">
                <img
                  src={aiPreviewUrl}
                  alt="Vista previa generada"
                  className="max-h-48 w-full rounded object-contain"
                />
                <p className="mt-1 text-xs text-muted">
                  Imagen generada (ya guardada en el post)
                </p>
              </div>
            )}
          </div>
        )}

        {(mediaMode === 'upload' || mediaMode === 'reel') && (
          <div className="space-y-2">
            <label htmlFor="media" className="mb-1 block text-sm text-muted">
              {mediaMode === 'reel' ? 'Video para Reel' : 'Imagen o video (opcional)'}
            </label>
            <input
              id="media"
              type="file"
              accept={mediaMode === 'reel' ? 'video/mp4,video/quicktime,video/webm' : ACCEPT_MEDIA}
              onChange={(e) => handleMediaChange(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-ink"
            />
            <p className="text-xs text-muted">
              {mediaMode === 'reel'
                ? 'Videos hasta 50 MB (MP4, MOV, WebM). Se publicará como Reel en Instagram.'
                : 'Imágenes hasta 10 MB · Videos hasta 50 MB (JPEG, PNG, WebP, GIF, MP4, MOV, WebM)'}
            </p>
            {mediaPreview && (
              <div className="mt-3 rounded-md border border-line-strong bg-white p-2">
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
                    className="mt-2 text-xs text-red-600 hover:text-red-700"
                  >
                    Quitar adjunto
                  </button>
                )}
              </div>
            )}
            {mediaMode === 'upload' && hasVideoAttachment() && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={publishAsReel}
                  onChange={(e) => setPublishAsReel(e.target.checked)}
                />
                Publicar como Reel en Instagram
              </label>
            )}
            {(mediaMode === 'reel' || publishAsReel) && hasVideoAttachment() && (
              <p className="mt-1 text-xs text-muted">
                Facebook recibirá el video en feed. Solo Instagram usa formato Reel.
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="client" className="mb-1 block text-sm text-muted">
            Cliente
          </label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="caption" className="mb-1 block text-sm text-muted">
            Caption
          </label>
          <textarea
            id="caption"
            required
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
            placeholder="Texto del post…"
          />
        </div>

        <div>
          <label htmlFor="hashtags" className="mb-1 block text-sm text-muted">
            Hashtags (separados por espacio o coma)
          </label>
          <input
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
            placeholder="#marca #promo"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">Destinos</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.length === 0 ? (
              <p className="text-xs text-muted">No hay cuentas conectadas para este cliente.</p>
            ) : (
              accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs text-muted"
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

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        {mediaMode !== 'ai' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting || selectedAccounts.length === 0}
              onClick={(e) => handleSubmit(e, false)}
              className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-50"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={submitting || selectedAccounts.length === 0}
              onClick={(e) => handleSubmit(e, true)}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Enviar a aprobación
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
