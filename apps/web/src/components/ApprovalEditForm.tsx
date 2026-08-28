'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiFetch, apiUploadMedia } from '@/lib/api';
import type { MediaAsset, Post } from '@/lib/types';

const ACCEPT_MEDIA =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

function hashtagsToInput(tags: string[]) {
  return tags.join(' ');
}

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

export function ApprovalEditForm({
  post,
  busy,
  onSaved,
  onCancel,
  onError,
}: {
  post: Post;
  busy?: boolean;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [caption, setCaption] = useState(post.caption ?? '');
  const [hashtags, setHashtags] = useState(hashtagsToInput(post.hashtags));
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCaption(post.caption ?? '');
    setHashtags(hashtagsToInput(post.hashtags));
    setMediaFile(null);
    setMediaPreview(null);
  }, [post.id, post.caption, post.hashtags]);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  function handleMediaChange(file: File | null) {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError('');
    try {
      await apiFetch<Post>(`/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          caption: caption.trim(),
          hashtags: parseHashtags(hashtags),
        }),
      });
      if (mediaFile) {
        await apiUploadMedia<MediaAsset>(post.id, mediaFile);
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'No se pudo guardar la edición');
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <form
      onSubmit={handleSave}
      className="mt-3 space-y-3 rounded-md border border-brand/25 bg-[#E7F3FF] p-3"
    >
      <p className="text-xs font-medium text-brand">Editar antes de aprobar</p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Caption</span>
        <textarea
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={disabled}
          className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Hashtags</span>
        <input
          type="text"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          disabled={disabled}
          placeholder="#marca #promo"
          className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">
          Reemplazar imagen o video (opcional)
        </span>
        <input
          type="file"
          accept={ACCEPT_MEDIA}
          disabled={disabled}
          onChange={(e) => handleMediaChange(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-ink"
        />
      </label>
      {mediaPreview && mediaFile && (
        <div className="rounded-md border border-line bg-white p-2">
          {mediaFile.type.startsWith('video/') ? (
            <video
              src={mediaPreview}
              controls
              className="max-h-40 w-full object-contain"
            />
          ) : (
            <img
              src={mediaPreview}
              alt="Nueva media"
              className="max-h-40 w-full object-contain"
            />
          )}
          <p className="mt-1 text-xs text-muted">Se reemplazará la media actual al guardar.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas disabled:opacity-50"
        >
          Cerrar edición
        </button>
      </div>
    </form>
  );
}
