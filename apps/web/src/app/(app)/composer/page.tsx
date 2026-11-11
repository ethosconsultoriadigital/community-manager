'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ApiError,
  apiFetch,
  pollAvatarJob,
  pollReelJob,
  apiUploadClientCharacter,
  apiUploadClientLogo,
  apiUploadMedia,
  apiUploadReference,
  apiUploadStandaloneImage,
} from '@/lib/api';
import {
  AVATAR_TEMPLATE_OPTIONS,
  readVideoTemplate,
  type AvatarTemplateValue,
} from '@/lib/brand-kit';
import { visualPresetChips } from '@/lib/platform-visual-hints';
import { ClientScopeField } from '@/components/ClientScopeField';
import { LibraryPicker } from '@/components/LibraryPicker';
import { PageHeader, SectionHeading } from '@/components/PageTypography';
import { useAssignedClients } from '@/lib/use-assigned-clients';
import type {
  GenerateFromBriefResult,
  LibraryItem,
  MediaAsset,
  Post,
  SocialAccount,
  VideoJobStartResult,
} from '@/lib/types';
import { StoryPublishCheckbox } from '@/lib/story-publish';

const ACCEPT_MEDIA =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

const ACCEPT_REFERENCE =
  'image/jpeg,image/png,image/webp,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';

const ACCEPT_BRAND_LOGO = 'image/png,image/jpeg,image/webp,image/gif';

const ACCEPT_REEL_STILL = 'image/jpeg,image/png,image/webp,image/gif';

const ACCEPT_CHARACTER = 'image/png,image/jpeg,image/webp,image/gif';

type MediaMode = 'ai' | 'upload' | 'reel' | 'avatar';

/** Borradores (uno por red) que dejó una generación IA con el media adjunto. */
type GeneratedDrafts = {
  kind: 'image' | 'reel' | 'avatar';
  posts: { postId: string; accountId: string }[];
};

export default function ComposerPage() {
  const searchParams = useSearchParams();
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    showClientSelector,
    loading: clientsLoading,
    error: clientsError,
    reloadClients,
  } = useAssignedClients();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [aiBrief, setAiBrief] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const [parsingReference, setParsingReference] = useState(false);
  const [composeLogoUrl, setComposeLogoUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaMode, setMediaMode] = useState<MediaMode>('upload');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingReel, setGeneratingReel] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [reelStillFile, setReelStillFile] = useState<File | null>(null);
  const [reelStillPreview, setReelStillPreview] = useState<string | null>(null);
  const [reelPreviewUrl, setReelPreviewUrl] = useState<string | null>(null);
  /** Duración objetivo del Reel IA (~5s por escena). */
  /** Todos los videos duran máx. 15 s: 2 escenas (8 + 7 s = 15 s) o 1 escena de 12 s (más barato). */
  const [reelSceneCount, setReelSceneCount] = useState<1 | 2>(2);
  const [reelWithMusic, setReelWithMusic] = useState(true);
  const [reelWithSubtitles, setReelWithSubtitles] = useState(true);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [characterImageUrl, setCharacterImageUrl] = useState<string | null>(null);
  const [characterFileName, setCharacterFileName] = useState<string | null>(null);
  const [uploadingCharacter, setUploadingCharacter] = useState(false);
  const [avatarTargetSeconds, setAvatarTargetSeconds] = useState(15);
  const [avatarWithMusic, setAvatarWithMusic] = useState(true);
  const [avatarWithSubtitles, setAvatarWithSubtitles] = useState(true);
  /** Plantilla del video de avatar; por defecto la del cliente o Profesional. */
  const [avatarTemplate, setAvatarTemplate] = useState<AvatarTemplateValue>('profesional');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [publishAsReel, setPublishAsReel] = useState(false);
  const [alsoPublishAsStory, setAlsoPublishAsStory] = useState(false);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [placeResults, setPlaceResults] = useState<
    Array<{
      id: string;
      name: string;
      locationLabel?: string;
      taggableOnInstagram?: boolean;
      verified?: boolean;
    }>
  >([]);
  const [placeLink, setPlaceLink] = useState('');
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryPicker, setLibraryPicker] = useState<'text' | 'media' | null>(null);
  const [libraryMediaItemId, setLibraryMediaItemId] = useState<string | null>(null);
  const [savingLibrary, setSavingLibrary] = useState(false);
  /**
   * Media generado con IA (foto, Reel o avatar): la API dejó un borrador por red con
   * el media ya adjunto. El único «Enviar a aprobación» (abajo) los actualiza y envía.
   */
  const [generatedDrafts, setGeneratedDrafts] = useState<GeneratedDrafts | null>(null);
  const generatingMedia = generatingAi || generatingReel || generatingAvatar;
  const waitingMediaLabel = generatingAi
    ? 'Esperando a que termine la imagen…'
    : 'Esperando a que termine el video…';

  useEffect(() => {
    if (!clientsLoading) setLoading(false);
  }, [clientsLoading]);

  useEffect(() => {
    if (clientsError) setError(clientsError);
  }, [clientsError]);

  useEffect(() => {
    const brand = selectedClient?.brand;
    const logoUrl =
      brand && typeof brand.logoUrl === 'string' && brand.logoUrl.trim()
        ? brand.logoUrl.trim()
        : null;
    setComposeLogoUrl(logoUrl);
    if (!logoUrl) setLogoFileName(null);
    const charUrl =
      brand && typeof brand.characterImageUrl === 'string' && brand.characterImageUrl.trim()
        ? brand.characterImageUrl.trim()
        : null;
    setCharacterImageUrl(charUrl);
    if (!charUrl) setCharacterFileName(null);
    setAvatarTemplate(readVideoTemplate(brand));
  }, [selectedClient?.id, selectedClient?.brand]);

  const loadPostIntoForm = useCallback(async (postId: string) => {
    const post = await apiFetch<Post>(`/posts/${postId}`);
    setGeneratedDrafts(null);
    setEditingPostId(post.id);
    setClientId(post.client_id);
    setCaption(post.caption ?? '');
    setHashtags(post.hashtags?.join(' ') ?? '');
    setSelectedAccounts(post.post_targets.map((t) => t.social_accounts.id));
    setPublishAsReel(post.video_format === 'reel');
    setAlsoPublishAsStory(Boolean(post.also_publish_as_story));
    setPlaceId(post.place_id ?? null);
    setPlaceName(post.place_name ?? null);
    setPlaceResults([]);

    const image = post.media_assets?.find((m) => m.type === 'image');
    const video = post.media_assets?.find((m) => m.type === 'video');
    setLibraryMediaItemId(null);
    if (image?.storage_url) {
      // Media ya existente: modo upload (no IA) para poder enviar a aprobación sin brief.
      setAiPreviewUrl(image.storage_url);
      setMediaFile(null);
      setMediaPreview(null);
      setMediaMode('upload');
      setPublishAsReel(false);
    } else if (video?.storage_url) {
      setAiPreviewUrl(null);
      setMediaFile(null);
      setMediaPreview(video.storage_url);
      setMediaMode(post.video_format === 'reel' ? 'reel' : 'upload');
      setPublishAsReel(post.video_format === 'reel');
    }
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit') ?? searchParams.get('canva_return');
    if (editId) {
      loadPostIntoForm(editId)
        .then(() => {
          const fromDuplicate = searchParams.get('edit');
          setMessage(
            fromDuplicate
              ? `Borrador duplicado cargado (${editId.slice(0, 8)}…). Revisa y envía a aprobación.`
              : `Post cargado (${editId.slice(0, 8)}…). Puedes enviarlo a aprobación.`,
          );
        })
        .catch(() => setError('No se pudo cargar el post'));
    }
  }, [searchParams, loadPostIntoForm]);

  // Los borradores generados son del cliente anterior: no se mezclan con otro cliente.
  const draftsClientRef = useRef(clientId);
  useEffect(() => {
    if (draftsClientRef.current !== clientId) {
      draftsClientRef.current = clientId;
      if (generatedDrafts && !editingPostId) {
        discardGeneratedDrafts();
        setAiPreviewUrl(null);
        setReelPreviewUrl(null);
      }
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    apiFetch<SocialAccount[]>(`/social-accounts?clientId=${clientId}`)
      .then((data) => {
        const active = data.filter((a) => a.is_active !== false);
        setAccounts(active);
        // Ninguna red marcada por defecto: el usuario elige. Al editar/duplicar se
        // conservan las redes del post (solo se quitan las que ya no están activas).
        setSelectedAccounts((prev) => prev.filter((id) => active.some((a) => a.id === id)));
      })
      .catch(() => setError('No se pudieron cargar las cuentas sociales'));
  }, [clientId, editingPostId]);

  function selectAllAccounts() {
    setSelectedAccounts(accounts.map((a) => a.id));
  }

  function clearAllAccounts() {
    setSelectedAccounts([]);
  }

  /** Borra los borradores que dejó una generación IA que ya no se va a usar. */
  function discardGeneratedDrafts() {
    if (!generatedDrafts) return;
    const ids = generatedDrafts.posts.map((p) => p.postId);
    setGeneratedDrafts(null);
    for (const id of ids) {
      void apiFetch(`/posts/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  function removeGeneratedMedia() {
    discardGeneratedDrafts();
    setAiPreviewUrl(null);
    setReelPreviewUrl(null);
    setMessage('Media generado quitado del post.');
  }

  function rememberGeneratedDrafts(kind: GeneratedDrafts['kind'], posts: Post[] | undefined, primary: Post) {
    const list = posts?.length ? posts : [primary];
    setGeneratedDrafts({
      kind,
      posts: list
        .map((p) => ({ postId: p.id, accountId: p.post_targets?.[0]?.social_accounts?.id ?? '' }))
        .filter((p) => p.accountId),
    });
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleMediaChange(file: File | null) {
    if (file) {
      discardGeneratedDrafts();
      setReelPreviewUrl(null);
    }
    if (mediaPreview?.startsWith('blob:')) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setAiPreviewUrl(null);
    setLibraryMediaItemId(null);
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
    if (mode === mediaMode) return;
    if (generatedDrafts) {
      // Cambiar de tipo de media descarta lo generado (no se mezcla con el nuevo).
      discardGeneratedDrafts();
      setReelPreviewUrl(null);
      setAiPreviewUrl(null);
    }
    setMediaMode(mode);
    setError(null);
    setMessage(null);
    setLibraryMediaItemId(null);
    if (mode === 'ai') {
      handleMediaChange(null);
      setPublishAsReel(false);
    } else if (mode === 'reel' || mode === 'avatar') {
      setAiPreviewUrl(null);
      setPublishAsReel(true);
      if (mode === 'reel' && mediaFile && !mediaFile.type.startsWith('video/')) {
        handleMediaChange(null);
      }
    } else {
      setAiPreviewUrl(null);
      if (!mediaFile?.type.startsWith('video/')) {
        setPublishAsReel(false);
      }
    }
  }

  async function handleCharacterFile(file: File | null) {
    if (!file) {
      setCharacterImageUrl(null);
      setCharacterFileName(null);
      return;
    }
    if (!clientId) {
      setError('Selecciona un cliente antes de adjuntar el personaje');
      return;
    }
    setUploadingCharacter(true);
    setError(null);
    try {
      const result = await apiUploadClientCharacter(clientId, file);
      setCharacterImageUrl(result.characterImageUrl);
      setCharacterFileName(file.name);
      setMessage('Personaje de marca guardado. Se usará para el avatar con lip-sync.');
      await reloadClients().catch(() => undefined);
    } catch (err) {
      setCharacterImageUrl(null);
      setCharacterFileName(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el personaje');
    } finally {
      setUploadingCharacter(false);
    }
  }

  async function handleGenerateAvatar() {
    if (!aiBrief.trim()) {
      setError('Escribe un brief para el guion del personaje');
      return;
    }
    if (!caption.trim()) {
      setError('Escribe el texto de publicación del post antes de generar');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos una red social en «Cliente y redes».');
      return;
    }
    if (!characterImageUrl) {
      setError('Adjunta la imagen del personaje de marca');
      return;
    }

    setError(null);
    setMessage(null);
    if (generatedDrafts) setReelPreviewUrl(null);
    discardGeneratedDrafts();
    setGeneratingAvatar(true);
    try {
      const started = await apiFetch<VideoJobStartResult>('/generations/from-brief-avatar', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          brief: aiBrief.trim(),
          caption: caption.trim(),
          hashtags: parseHashtags(),
          socialAccountIds: selectedAccounts,
          characterImageUrl,
          targetSeconds: avatarTargetSeconds,
          withMusic: avatarWithMusic,
          withSubtitles: avatarWithSubtitles,
          template: avatarTemplate,
          asDraft: true,
          ...(referenceText.trim() ? { referenceText: referenceText.trim() } : {}),
          ...placePayload(),
        }),
      });

      setMessage(
        `Avatar en cola (${started.generationId.slice(0, 8)}…). Puede tardar varios minutos; si la API se ocupa un momento, el front reintenta solo…`,
      );

      const result = await pollAvatarJob(started.generationId);

      const video = result.media.find((m) => m.type === 'video');
      if (video?.storage_url) {
        setReelPreviewUrl(video.storage_url);
        handleMediaChange(null);
      }

      rememberGeneratedDrafts('avatar', result.posts, result.post);
      setMessage(
        result.usedMock
          ? `Avatar de prueba listo y adjunto al post. Pulsa «Enviar a aprobación» abajo. Configura ELEVENLABS_API_KEY y FAL_KEY para producción.`
          : `Avatar listo (${result.videoModel ?? 'tts+lipsync'}) y adjunto al post. Revisa y pulsa «Enviar a aprobación» abajo.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar el avatar');
    } finally {
      setGeneratingAvatar(false);
    }
  }

  function clearForm() {
    setGeneratedDrafts(null);
    setCaption('');
    setHashtags('');
    setAiBrief('');
    setAiPreviewUrl(null);
    setReelPreviewUrl(null);
    setReelStillFile(null);
    if (reelStillPreview?.startsWith('blob:')) URL.revokeObjectURL(reelStillPreview);
    setReelStillPreview(null);
    setEditingPostId(null);
    setPublishAsReel(mediaMode === 'reel');
    setAlsoPublishAsStory(false);
    setPlaceId(null);
    setPlaceName(null);
    setPlaceResults([]);
    setLibraryMediaItemId(null);
    handleMediaChange(null);
  }

  function applyLibraryText(item: LibraryItem) {
    setCaption(item.caption ?? '');
    setHashtags(item.hashtags?.join(' ') ?? '');
    setMessage('Texto cargado desde la biblioteca.');
  }

  function applyLibraryMedia(item: LibraryItem) {
    if (!item.storage_url) return;
    discardGeneratedDrafts();
    setReelPreviewUrl(null);
    if (mediaPreview?.startsWith('blob:')) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setLibraryMediaItemId(item.id);
    setAiBrief('');
    // Nunca activar modo IA: el media ya está listo para adjuntar / enviar a aprobación.
    if (item.kind === 'image') {
      setAiPreviewUrl(item.storage_url);
      setMediaPreview(null);
      setMediaMode('upload');
      setPublishAsReel(false);
    } else {
      setAiPreviewUrl(null);
      setMediaPreview(item.storage_url);
      setMediaMode('upload');
      setPublishAsReel(false);
    }
    setMessage('Media cargado desde la biblioteca. Puedes enviarlo a aprobación.');
  }

  async function saveCaptionToLibrary() {
    if (!clientId) {
      setError('Selecciona un cliente');
      return;
    }
    if (!caption.trim()) {
      setError('Escribe un texto antes de guardarlo en la biblioteca');
      return;
    }
    setSavingLibrary(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/library', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          kind: 'text',
          caption: caption.trim(),
          hashtags: parseHashtags(),
        }),
      });
      setMessage('Texto guardado en la biblioteca.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar en la biblioteca');
    } finally {
      setSavingLibrary(false);
    }
  }

  async function saveCurrentMediaToLibrary() {
    if (!clientId) {
      setError('Selecciona un cliente');
      return;
    }
    const url =
      aiPreviewUrl ||
      (mediaPreview && !mediaPreview.startsWith('blob:') ? mediaPreview : null);
    if (!url) {
      setError('Guarda o publica el post primero, o elige media ya alojado (no un archivo local sin subir)');
      return;
    }
    const kind: 'image' | 'video' =
      mediaMode === 'reel' || Boolean(mediaPreview && !aiPreviewUrl) ? 'video' : 'image';
    // Prefer explicit image preview
    const resolvedKind: 'image' | 'video' = aiPreviewUrl ? 'image' : kind;
    setSavingLibrary(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/library', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          kind: resolvedKind,
          storageUrl: url,
          mediaSource: mediaMode === 'ai' ? 'ai_generated' : 'upload',
          caption: caption.trim() || null,
        }),
      });
      setMessage('Media guardado en la biblioteca.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el media');
    } finally {
      setSavingLibrary(false);
    }
  }

  function placePayload() {
    return {
      placeId: placeId,
      placeName: placeName,
    };
  }

  function choosePlace(p: {
    id: string;
    name: string;
    taggableOnInstagram?: boolean;
    verified?: boolean;
  }) {
    setPlaceId(p.id);
    setPlaceName(p.name);
    setPlaceResults([]);
    const notes: string[] = [];
    if (p.verified === false) {
      notes.push('No se pudo verificar su dirección en Meta; si Meta la rechaza, el post sale sin ubicación.');
    } else if (p.taggableOnInstagram === false) {
      notes.push('Instagram no la acepta (la página no tiene coordenadas); en Instagram saldrá sin ubicación.');
    }
    setMessage(`Ubicación lista: ${p.name}${notes.length ? `. ${notes.join(' ')}` : ''}`);
  }

  async function applyOwnPagePlace() {
    if (!clientId) return;
    setResolvingPlace(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiFetch<{
        places: Array<{
          id: string;
          name: string;
          locationLabel?: string;
          taggableOnInstagram?: boolean;
          verified?: boolean;
        }>;
        message?: string;
      }>(`/platforms/meta/places/own?clientId=${encodeURIComponent(clientId)}`);
      const places = data.places ?? [];
      if (places.length === 1) {
        choosePlace(places[0]!);
      } else if (places.length > 1) {
        setPlaceResults(places);
        setMessage('Elige cuál de tus páginas usar como ubicación.');
      } else {
        setError(data.message ?? 'La página del cliente no tiene dirección en Facebook.');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo leer la ubicación de la página',
      );
    } finally {
      setResolvingPlace(false);
    }
  }

  async function resolvePastedPlace() {
    if (!clientId || !placeLink.trim()) return;
    setResolvingPlace(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiFetch<{
        place: {
          id: string;
          name: string;
          locationLabel?: string;
          taggableOnInstagram?: boolean;
          verified?: boolean;
        };
      }>(
        `/platforms/meta/places/resolve?clientId=${encodeURIComponent(clientId)}&input=${encodeURIComponent(placeLink.trim())}`,
      );
      choosePlace(data.place);
      setPlaceLink('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo leer esa página');
    } finally {
      setResolvingPlace(false);
    }
  }

  function hasVideoAttachment(): boolean {
    if (mediaFile?.type.startsWith('video/')) return true;
    return Boolean(mediaPreview && !mediaFile && !aiPreviewUrl);
  }

  function videoFormatPayload(): 'feed' | 'reel' | null {
    if (!hasVideoAttachment()) return null;
    return publishAsReel || mediaMode === 'reel' || mediaMode === 'avatar'
      ? 'reel'
      : 'feed';
  }

  function parseHashtags(): string[] {
    return hashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
  }

  async function handleReferenceFile(file: File | null) {
    if (!file) {
      setReferenceText('');
      setReferenceFileName(null);
      return;
    }
    setParsingReference(true);
    setError(null);
    try {
      const result = await apiUploadReference<{ referenceText: string }>(file);
      setReferenceText(result.referenceText);
      setReferenceFileName(file.name);
      setMessage('Referencia procesada. Se usará al generar el visual.');
    } catch (err) {
      setReferenceText('');
      setReferenceFileName(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo leer la referencia');
    } finally {
      setParsingReference(false);
    }
  }

  async function handleBrandLogoFile(file: File | null) {
    if (!file) {
      setComposeLogoUrl(null);
      setLogoFileName(null);
      return;
    }
    if (!clientId) {
      setError('Selecciona un cliente antes de adjuntar el logo');
      return;
    }
    setUploadingLogo(true);
    setError(null);
    try {
      const result = await apiUploadClientLogo(clientId, file);
      setComposeLogoUrl(result.logoUrl);
      setLogoFileName(file.name);
      setMessage(
        'Logo de marca guardado. Se pegará intacto sobre el fondo (no se envía a la IA).',
      );
      await reloadClients().catch(() => undefined);
    } catch (err) {
      setComposeLogoUrl(null);
      setLogoFileName(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  const selectedPlatforms = useMemo(
    () =>
      accounts
        .filter((a) => selectedAccounts.includes(a.id))
        .map((a) => a.platform),
    [accounts, selectedAccounts],
  );

  const presetChips = useMemo(() => visualPresetChips(selectedPlatforms), [selectedPlatforms]);

  async function handleGenerateCopy() {
    const brief = (aiBrief.trim() || caption.trim());
    if (!brief) {
      setError('Escribe un brief o unas ideas en el texto de publicación para generar el contenido');
      return;
    }
    setError(null);
    setMessage(null);
    setGeneratingCopy(true);
    try {
      const result = await apiFetch<{
        caption: string;
        hashtags: string[];
        usedMock?: boolean;
      }>('/generations/copy', {
        method: 'POST',
        body: JSON.stringify({
          brief,
          platforms: selectedPlatforms.length ? selectedPlatforms : ['facebook', 'instagram'],
          clientId: clientId || undefined,
        }),
      });
      setCaption(result.caption ?? '');
      if (result.hashtags?.length) {
        setHashtags(result.hashtags.join(' '));
      }
      setMessage(
        result.usedMock
          ? 'Texto de ejemplo generado (modo desarrollo).'
          : 'Texto de publicación y hashtags generados con IA. Puedes editarlos antes de publicar.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el texto');
    } finally {
      setGeneratingCopy(false);
    }
  }

  async function handleGenerateWithAi() {
    if (!aiBrief.trim()) {
      setError('Escribe un brief para generar la imagen con IA');
      return;
    }
    if (!caption.trim()) {
      setError('Escribe el texto de publicación del post antes de generar');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos una red social en «Cliente y redes».');
      return;
    }

    setError(null);
    setMessage(null);
    if (generatedDrafts) setAiPreviewUrl(null);
    discardGeneratedDrafts();
    setGeneratingAi(true);

    try {
      const result = await apiFetch<GenerateFromBriefResult>('/generations/from-brief', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          brief: aiBrief.trim(),
          caption: caption.trim(),
          hashtags: parseHashtags(),
          socialAccountIds: selectedAccounts,
          ...(referenceText.trim() ? { referenceText: referenceText.trim() } : {}),
          ...(composeLogoUrl
            ? {
                composeLogoUrl,
                composeWithBrand: true,
                composeFields: { title: caption.trim().slice(0, 120) },
              }
            : {}),
          videoFormat: mediaMode === 'reel' ? 'reel' : 'feed',
          asDraft: true,
          ...placePayload(),
        }),
      });

      const image = result.media.find((m) => m.type === 'image');
      if (image?.storage_url) {
        setAiPreviewUrl(image.storage_url);
        handleMediaChange(null);
      }

      rememberGeneratedDrafts('image', result.posts, result.post);
      setMessage(
        result.usedMock || result.imageProvider === 'mock'
          ? 'Visual de prueba listo y adjunto al post. Pulsa «Enviar a aprobación» abajo.'
          : `Imagen generada con IA (${result.imageModel ?? 'openai'}) y adjunta al post. Revisa y pulsa «Enviar a aprobación» abajo.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar con IA');
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleGenerateReel() {
    if (!aiBrief.trim()) {
      setError('Escribe un brief para generar el Reel con IA');
      return;
    }
    if (!caption.trim()) {
      setError('Escribe el texto de publicación del post antes de generar');
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos una red social en «Cliente y redes».');
      return;
    }

    setError(null);
    setMessage(null);
    if (generatedDrafts) setReelPreviewUrl(null);
    discardGeneratedDrafts();
    setGeneratingReel(true);

    try {
      let referenceImageUrl: string | undefined;
      if (reelStillFile) {
        const uploaded = await apiUploadStandaloneImage(reelStillFile);
        referenceImageUrl = uploaded.storageUrl;
      } else if (aiPreviewUrl && !aiPreviewUrl.startsWith('blob:')) {
        referenceImageUrl = aiPreviewUrl;
      }

      const started = await apiFetch<VideoJobStartResult>('/generations/from-brief-reel', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          brief: aiBrief.trim(),
          caption: caption.trim(),
          hashtags: parseHashtags(),
          socialAccountIds: selectedAccounts,
          targetDurationSeconds: 15,
          sceneCount: reelSceneCount,
          withMusic: reelWithMusic,
          withSubtitles: reelWithSubtitles,
          asDraft: true,
          ...(referenceText.trim() ? { referenceText: referenceText.trim() } : {}),
          ...(referenceImageUrl ? { referenceImageUrl } : {}),
          ...placePayload(),
        }),
      });

      setMessage(
        `Reel en cola (${started.generationId.slice(0, 8)}…). Puede tardar varios minutos; si la API se ocupa un momento, el front reintenta solo…`,
      );

      const result = await pollReelJob(started.generationId);

      const video = result.media.find((m) => m.type === 'video');
      if (video?.storage_url) {
        setReelPreviewUrl(video.storage_url);
        handleMediaChange(null);
      }

      rememberGeneratedDrafts('reel', result.posts, result.post);
      setMessage(
        result.usedMock || result.videoProvider === 'mock'
          ? 'Reel de prueba listo y adjunto al post. Pulsa «Enviar a aprobación» abajo. Configura FAL_KEY para video real.'
          : `Reel generado con IA (${result.videoModel ?? 'fal'}) y adjunto al post. Revisa y pulsa «Enviar a aprobación» abajo.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar el Reel');
    } finally {
      setGeneratingReel(false);
    }
  }

  function storyEnabledForPlatform(platform: string): boolean {
    return (
      alsoPublishAsStory &&
      (platform === 'facebook' || platform === 'instagram') &&
      Boolean(mediaFile || aiPreviewUrl || mediaPreview || generatedDrafts)
    );
  }

  async function createPostForAccount(accountId: string, tagList: string[]): Promise<string> {
    const account = accounts.find((a) => a.id === accountId);
    const platform = account?.platform ?? '';
    const post = await apiFetch<Post>('/posts', {
      method: 'POST',
      body: JSON.stringify({
        clientId,
        caption,
        hashtags: tagList,
        socialAccountIds: [accountId],
        videoFormat: videoFormatPayload(),
        alsoPublishAsStory: storyEnabledForPlatform(platform),
        ...placePayload(),
      }),
    });
    if (mediaFile) {
      await apiUploadMedia<MediaAsset>(post.id, mediaFile);
    } else if (libraryMediaItemId) {
      await apiFetch(`/library/${libraryMediaItemId}/attach-to-post`, {
        method: 'POST',
        body: JSON.stringify({ postId: post.id, replace: true }),
      });
    }
    return post.id;
  }

  /**
   * Media generado con IA: cada red ya tiene su borrador con el media. Se actualiza
   * con el texto/opciones actuales; una red marcada después se cubre duplicando un
   * borrador (copia el media) y las redes desmarcadas borran su borrador.
   */
  async function submitGeneratedDrafts(drafts: GeneratedDrafts, sendToApproval: boolean, tagList: string[]) {
    const byAccount = new Map(drafts.posts.map((p) => [p.accountId, p.postId]));
    const sourceId = drafts.posts[0]?.postId;
    const kept: GeneratedDrafts['posts'] = [];
    for (const accountId of selectedAccounts) {
      let postId = byAccount.get(accountId);
      if (!postId) {
        if (!sourceId) throw new ApiError('Vuelve a generar el media', 400);
        const copy = await apiFetch<Post>(`/posts/${sourceId}/duplicate`, { method: 'POST' });
        postId = copy.id;
      }
      const platform = accounts.find((a) => a.id === accountId)?.platform ?? '';
      await apiFetch<Post>(`/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          caption,
          hashtags: tagList,
          socialAccountIds: [accountId],
          alsoPublishAsStory: storyEnabledForPlatform(platform),
          ...placePayload(),
        }),
      });
      kept.push({ postId, accountId });
    }
    const keptIds = new Set(kept.map((p) => p.postId));
    for (const p of drafts.posts) {
      if (!keptIds.has(p.postId)) {
        await apiFetch(`/posts/${p.postId}`, { method: 'DELETE' }).catch(() => undefined);
      }
    }
    if (sendToApproval) {
      for (const p of kept) {
        await apiFetch(`/posts/${p.postId}/submit-for-approval`, { method: 'POST' });
      }
      setMessage(
        kept.length > 1
          ? `${kept.length} posts enviados a aprobación con el media generado (uno por red).`
          : `Post enviado a aprobación con el media generado (${kept[0]!.postId.slice(0, 8)}…)`,
      );
      clearForm();
    } else {
      setGeneratedDrafts({ ...drafts, posts: kept });
      setMessage(
        kept.length > 1
          ? `${kept.length} borradores guardados con el media generado (uno por red).`
          : `Borrador guardado con el media generado (${kept[0]!.postId.slice(0, 8)}…)`,
      );
    }
  }

  async function handleSubmit(e: FormEvent, sendToApproval: boolean) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (generatingMedia) {
      setError(waitingMediaLabel);
      return;
    }
    if (selectedAccounts.length === 0) {
      setError('Selecciona al menos una red social en «Cliente y redes».');
      return;
    }
    if (generatedDrafts && !caption.trim()) {
      setError('Escribe el texto de publicación antes de enviar.');
      return;
    }
    if (!generatedDrafts) {
      if (mediaMode === 'ai') {
        setError('Primero pulsa «Generar foto» (o elige otro tipo de media).');
        return;
      }
      if (mediaMode === 'avatar') {
        setError('Primero pulsa «Generar avatar» para crear el video.');
        return;
      }
      if (mediaMode === 'reel' && !hasVideoAttachment() && !mediaFile) {
        setError('Para Reel genera el video con «Generar Reel» o sube uno propio.');
        return;
      }
    }
    if (mediaMode === 'upload' && !mediaFile && !aiPreviewUrl && !mediaPreview) {
      // adjunto opcional en upload/feed
    }

    setSubmitting(true);

    const tagList = parseHashtags();

    try {
      if (generatedDrafts) {
        await submitGeneratedDrafts(generatedDrafts, sendToApproval, tagList);
        return;
      }

      // Editar un post existente: se mantiene un solo post (no se parte en varios).
      if (editingPostId) {
        const primaryAccountId = selectedAccounts[0];
        const account = accounts.find((a) => a.id === primaryAccountId);
        await apiFetch<Post>(`/posts/${editingPostId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            caption,
            hashtags: tagList,
            socialAccountIds: [primaryAccountId],
            videoFormat: videoFormatPayload(),
            alsoPublishAsStory: storyEnabledForPlatform(account?.platform ?? ''),
            ...placePayload(),
          }),
        });
        if (mediaFile) {
          await apiUploadMedia<MediaAsset>(editingPostId, mediaFile);
        } else if (libraryMediaItemId) {
          await apiFetch(`/library/${libraryMediaItemId}/attach-to-post`, {
            method: 'POST',
            body: JSON.stringify({ postId: editingPostId, replace: true }),
          });
        }

        const extraIds = selectedAccounts.slice(1);
        const createdExtras: string[] = [];
        for (const accountId of extraIds) {
          const id = await createPostForAccount(accountId, tagList);
          createdExtras.push(id);
          if (sendToApproval) {
            await apiFetch(`/posts/${id}/submit-for-approval`, { method: 'POST' });
          }
        }

        if (sendToApproval) {
          await apiFetch(`/posts/${editingPostId}/submit-for-approval`, { method: 'POST' });
          const total = 1 + createdExtras.length;
          setMessage(
            total > 1
              ? `${total} posts enviados a aprobación (uno por red).`
              : `Post enviado a aprobación${mediaFile || aiPreviewUrl ? ' con media' : ''} (${editingPostId.slice(0, 8)}…)`,
          );
          clearForm();
        } else {
          setMessage(
            createdExtras.length
              ? `Borrador actualizado y ${createdExtras.length} borrador(es) extra (uno por red adicional).`
              : `Borrador guardado (${editingPostId.slice(0, 8)}…)`,
          );
        }
        return;
      }

      // Alta nueva: un post independiente por cada red/cuenta (como Radar).
      const createdIds: string[] = [];
      for (const accountId of selectedAccounts) {
        const id = await createPostForAccount(accountId, tagList);
        createdIds.push(id);
      }

      if (sendToApproval) {
        for (const id of createdIds) {
          await apiFetch(`/posts/${id}/submit-for-approval`, { method: 'POST' });
        }
        setMessage(
          createdIds.length > 1
            ? `${createdIds.length} posts enviados a aprobación (uno por red).`
            : `Post enviado a aprobación${mediaFile || aiPreviewUrl ? ' con media' : ''} (${createdIds[0].slice(0, 8)}…)`,
        );
        clearForm();
      } else {
        setEditingPostId(createdIds[0] ?? null);
        setMessage(
          createdIds.length > 1
            ? `${createdIds.length} borradores guardados (uno por red). Puedes editarlos en Aprobaciones.`
            : `Borrador guardado (${createdIds[0].slice(0, 8)}…)`,
        );
        if (createdIds.length > 1) {
          clearForm();
        }
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

  const aiSourceActive =
    mediaMode === 'ai' || mediaMode === 'reel' || mediaMode === 'avatar';
  const btnSecondary =
    'rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-50';
  const inputClass =
    'w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generar Contenido"
        description={
          <>
            Escribe el texto, elige redes y adjunta media (IA foto/video, archivo o biblioteca). Si
            marcas varias redes, se crea <strong className="text-ink">un post por red</strong>, cada
            uno con su aprobación.
          </>
        }
      />

      <form className="space-y-6 rounded-xl border border-line bg-surface p-4 sm:p-6">
        {/* 1. Cliente y destinos */}
        <section className="space-y-4" aria-labelledby="composer-scope">
          <SectionHeading id="composer-scope" step={1}>
            Cliente y redes
          </SectionHeading>
          <ClientScopeField
            clients={clients}
            clientId={clientId}
            onClientIdChange={setClientId}
            showSelector={showClientSelector}
            selectedClient={selectedClient}
            className="block"
          />
          <fieldset>
            <legend className="mb-2 text-sm text-muted">Destinos</legend>
            {accounts.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllAccounts}
                  disabled={submitting || selectedAccounts.length === accounts.length}
                  className={btnSecondary}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={clearAllAccounts}
                  disabled={submitting || selectedAccounts.length === 0}
                  className={btnSecondary}
                >
                  Desmarcar todas
                </button>
                <span className="text-xs text-muted">
                  {selectedAccounts.length === 0
                    ? 'Marca las redes donde se publicará.'
                    : `${selectedAccounts.length} de ${accounts.length} seleccionada(s)`}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {accounts.length === 0 ? (
                <p className="text-xs text-muted">No hay cuentas conectadas para este cliente.</p>
              ) : (
                accounts.map((a) => (
                  <label
                    key={a.id}
                    title={`Publicar en ${a.platform}${a.username ? ` (${a.username})` : ''}`}
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
            {presetChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {presetChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-line bg-canvas px-2 py-0.5 text-xs text-muted"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </fieldset>
        </section>

        {/* 2. Texto */}
        <section className="space-y-3 border-t border-line pt-5" aria-labelledby="composer-text">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading id="composer-text" step={2}>
              Texto de la publicación
            </SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title="Cargar un texto guardado en la biblioteca"
                onClick={() => setLibraryPicker('text')}
                disabled={!clientId || submitting}
                className={btnSecondary}
              >
                De biblioteca
              </button>
              <button
                type="button"
                title="Guardar el texto actual en la biblioteca para reutilizarlo"
                onClick={() => void saveCaptionToLibrary()}
                disabled={savingLibrary || submitting || !caption.trim()}
                className={btnSecondary}
              >
                {savingLibrary ? 'Guardando…' : 'Guardar texto'}
              </button>
              <button
                type="button"
                title="Generar caption y hashtags con IA a partir de una idea breve"
                onClick={() => void handleGenerateCopy()}
                disabled={generatingCopy || generatingAi || generatingReel || submitting}
                className={btnSecondary}
              >
                {generatingCopy ? 'Generando texto…' : 'Generar texto con IA'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="caption" className="mb-1 block text-sm text-muted">
              Texto de publicación
            </label>
            <textarea
              id="caption"
              required
              rows={5}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className={inputClass}
              placeholder="Texto del post… o escribe una idea y usa «Generar texto con IA»"
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
              className={inputClass}
              placeholder="#marca #promo"
            />
          </div>
        </section>

        {/* 3. Media */}
        <section className="space-y-4 border-t border-line pt-5" aria-labelledby="composer-media">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading id="composer-media" step={3}>
              Media (imagen o video)
            </SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title="Elegir imagen o video ya guardado en la biblioteca"
                onClick={() => setLibraryPicker('media')}
                disabled={!clientId || submitting}
                className={btnSecondary}
              >
                De biblioteca
              </button>
              <button
                type="button"
                title="Guardar el media actual del post en la biblioteca"
                onClick={() => void saveCurrentMediaToLibrary()}
                disabled={
                  savingLibrary ||
                  submitting ||
                  !(
                    aiPreviewUrl ||
                    (mediaPreview && !mediaPreview.startsWith('blob:'))
                  )
                }
                className={btnSecondary}
              >
                Guardar media
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              title="Generar foto o Reel con inteligencia artificial"
              onClick={() =>
                selectMediaMode(
                  mediaMode === 'reel' || mediaMode === 'avatar' ? mediaMode : 'ai',
                )
              }
              className={`rounded-md px-3 py-2 text-sm ${
                aiSourceActive
                  ? 'bg-brand text-white'
                  : 'border border-line-strong text-muted hover:bg-canvas'
              }`}
            >
              Generar contenido visual con IA
            </button>
            <button
              type="button"
              title="Subir una imagen o video desde tu equipo"
              onClick={() => selectMediaMode('upload')}
              className={`rounded-md px-3 py-2 text-sm ${
                mediaMode === 'upload'
                  ? 'bg-brand text-white'
                  : 'border border-line-strong text-muted hover:bg-canvas'
              }`}
            >
              Subir archivo
            </button>
          </div>

          {aiSourceActive && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                title="Generar una imagen estática con IA (OpenAI)"
                onClick={() => selectMediaMode('ai')}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  mediaMode === 'ai'
                    ? 'bg-brand/90 text-white'
                    : 'border border-line-strong text-muted hover:bg-canvas'
                }`}
              >
                Foto
              </button>
              <button
                type="button"
                title="Generar un Reel/video con IA (fal.ai) o preparar formato Reel"
                onClick={() => selectMediaMode('reel')}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  mediaMode === 'reel'
                    ? 'bg-brand/90 text-white'
                    : 'border border-line-strong text-muted hover:bg-canvas'
                }`}
              >
                Video / Reel
              </button>
              <button
                type="button"
                title="Personaje estilizado que habla (TTS + lip-sync)"
                onClick={() => selectMediaMode('avatar')}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  mediaMode === 'avatar'
                    ? 'bg-brand/90 text-white'
                    : 'border border-line-strong text-muted hover:bg-canvas'
                }`}
              >
                Avatar
              </button>
            </div>
          )}

          {libraryMediaItemId && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Media seleccionado desde la biblioteca (se adjuntará al guardar).
            </p>
          )}

          {mediaMode === 'ai' && (
            <div className="space-y-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div>
                <h3 className="text-sm font-medium text-brand">Foto con IA</h3>
                <p className="text-xs text-muted">
                  Describe la escena (solo fondo). Referencia = inspiración para la IA. Logo de
                  marca = se pega intacto por código, nunca a la IA.
                </p>
              </div>
              <textarea
                rows={3}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                className={inputClass}
                placeholder="Ej: foto de un latte en taza blanca sobre mesa de madera, luz natural…"
              />
              <div>
                <label htmlFor="reference" className="mb-1 block text-xs text-muted">
                  Referencia visual o documento (opcional)
                </label>
                <input
                  id="reference"
                  type="file"
                  accept={ACCEPT_REFERENCE}
                  disabled={parsingReference || generatingAi}
                  onChange={(e) => void handleReferenceFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2 file:py-1 file:text-white"
                />
                {referenceFileName && (
                  <p className="mt-1 text-xs text-muted">
                    Referencia: {referenceFileName}
                    {referenceText ? ' (lista para usar)' : ''}
                  </p>
                )}
                {parsingReference && (
                  <p className="mt-1 text-xs text-brand">Procesando referencia…</p>
                )}
              </div>
              <div>
                <label htmlFor="brand-logo" className="mb-1 block text-xs text-muted">
                  Adjuntar logo de marca (opcional)
                </label>
                <input
                  id="brand-logo"
                  type="file"
                  accept={ACCEPT_BRAND_LOGO}
                  disabled={uploadingLogo || generatingAi || !clientId}
                  onChange={(e) => void handleBrandLogoFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white"
                />
                {logoFileName && composeLogoUrl && (
                  <p className="mt-1 text-xs text-muted">
                    Logo: {logoFileName} (composición por código)
                  </p>
                )}
                {!logoFileName && composeLogoUrl && (
                  <p className="mt-1 text-xs text-muted">Logo de marca listo para componer</p>
                )}
                {uploadingLogo && (
                  <p className="mt-1 text-xs text-brand">Subiendo logo…</p>
                )}
              </div>
              <button
                type="button"
                title="Genera la imagen y la adjunta al post; luego envíalo con «Enviar a aprobación» (abajo)"
                disabled={
                  generatingMedia ||
                  submitting ||
                  parsingReference ||
                  uploadingLogo
                }
                onClick={handleGenerateWithAi}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {generatingAi
                  ? 'Generando contenido visual…'
                  : aiPreviewUrl && generatedDrafts
                    ? 'Volver a generar foto'
                    : 'Generar foto'}
              </button>
              {aiPreviewUrl && (
                <div className="rounded-md border border-line-strong bg-surface p-2">
                  <img
                    src={aiPreviewUrl}
                    alt="Vista previa generada"
                    className="max-h-48 w-full rounded object-contain"
                  />
                  {generatedDrafts && (
                    <button
                      type="button"
                      title="Quitar el media generado del post"
                      onClick={removeGeneratedMedia}
                      className="mt-2 text-xs text-red-600 hover:text-red-700"
                    >
                      Quitar media generado
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {mediaMode === 'reel' && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
                <div>
                  <h3 className="text-sm font-medium text-brand">Video / Reel con IA</h3>
                  <p className="text-xs text-muted">
                    Reel vertical 9:16 de máx. 15 s con subtítulos y música propia. Opcional:
                    foto de la 1.ª escena. Requiere FAL_KEY y saldo en fal.ai.
                  </p>
                </div>
                <textarea
                  rows={3}
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  className={inputClass}
                  placeholder="Ej: cámara lenta acercándose a un latte con vapor…"
                />
                <div>
                  <label htmlFor="reel-duration" className="mb-1 block text-xs text-muted">
                    Duración (máx. 15 s)
                  </label>
                  <select
                    id="reel-duration"
                    value={reelSceneCount}
                    disabled={generatingReel || submitting}
                    onChange={(e) => setReelSceneCount(Number(e.target.value) as 1 | 2)}
                    className={inputClass}
                  >
                    <option value={2}>15 s · 2 escenas (8 + 7 s)</option>
                    <option value={1}>12 s · 1 escena (más barato)</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reelWithSubtitles}
                      disabled={generatingReel || submitting}
                      onChange={(e) => setReelWithSubtitles(e.target.checked)}
                    />
                    Subtítulos
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reelWithMusic}
                      disabled={generatingReel || submitting}
                      onChange={(e) => setReelWithMusic(e.target.checked)}
                    />
                    Música de fondo
                  </label>
                </div>
                <div>
                  <label htmlFor="reel-still" className="mb-1 block text-xs text-muted">
                    Foto de referencia (opcional)
                  </label>
                  <input
                    id="reel-still"
                    type="file"
                    accept={ACCEPT_REEL_STILL}
                    disabled={generatingReel || submitting}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (reelStillPreview?.startsWith('blob:')) {
                        URL.revokeObjectURL(reelStillPreview);
                      }
                      setReelStillFile(file);
                      setReelStillPreview(file ? URL.createObjectURL(file) : null);
                    }}
                    className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2 file:py-1 file:text-white"
                  />
                  {reelStillPreview && (
                    <img
                      src={reelStillPreview}
                      alt="Referencia para Reel"
                      className="mt-2 max-h-32 rounded object-contain"
                    />
                  )}
                </div>
                <button
                  type="button"
                  title="Genera el Reel y lo adjunta al post (varios minutos; corre en segundo plano). Luego «Enviar a aprobación» (abajo)"
                  disabled={generatingMedia || submitting}
                  onClick={() => void handleGenerateReel()}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {generatingReel
                    ? 'Generando Reel en segundo plano (puede tardar varios minutos)…'
                    : reelPreviewUrl && generatedDrafts
                      ? 'Volver a generar Reel'
                      : 'Generar Reel'}
                </button>
                {reelPreviewUrl && (
                  <div>
                    <video
                      src={reelPreviewUrl}
                      controls
                      className="max-h-48 w-full rounded object-contain"
                    />
                    {generatedDrafts && (
                      <button
                        type="button"
                        title="Quitar el media generado del post"
                        onClick={removeGeneratedMedia}
                        className="mt-2 text-xs text-red-600 hover:text-red-700"
                      >
                        Quitar media generado
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 rounded-lg border border-line p-4">
                <label htmlFor="media-reel" className="mb-1 block text-sm text-muted">
                  O subir un video propio
                </label>
                <input
                  id="media-reel"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(e) => handleMediaChange(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-ink"
                />
                <p className="text-xs text-muted">
                  Videos hasta 50 MB (MP4, MOV, WebM). Se publicará como Reel en Instagram.
                </p>
              </div>
            </div>
          )}

          {mediaMode === 'avatar' && (
            <div className="space-y-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div>
                <h3 className="text-sm font-medium text-brand">Avatar / personaje</h3>
                <p className="text-xs text-muted">
                  Personaje cartoon/3D o semi-realista que habla un guion (TTS + lip-sync Sync-3).
                  Retrato frontal con ojos, nariz y boca claros. En prod: ELEVENLABS + FAL.
                </p>
              </div>
              <textarea
                rows={3}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                className={inputClass}
                placeholder="Ej: presenta la promo 2x1 de lattes de forma amigable…"
              />
              <div>
                <label htmlFor="avatar-character" className="mb-1 block text-xs text-muted">
                  Imagen del personaje (obligatoria)
                </label>
                <input
                  id="avatar-character"
                  type="file"
                  accept={ACCEPT_CHARACTER}
                  disabled={uploadingCharacter || generatingAvatar || !clientId}
                  onChange={(e) => void handleCharacterFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white"
                />
                {characterImageUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={characterImageUrl}
                      alt="Personaje"
                      className="max-h-24 rounded object-contain"
                    />
                    <p className="text-xs text-muted">
                      {characterFileName ?? 'Personaje de marca listo'}
                    </p>
                  </div>
                )}
                {uploadingCharacter && (
                  <p className="mt-1 text-xs text-brand">Subiendo personaje…</p>
                )}
              </div>
              <div>
                <label htmlFor="avatar-duration" className="mb-1 block text-xs text-muted">
                  Duración del monólogo (máx. 15 s)
                </label>
                <select
                  id="avatar-duration"
                  value={avatarTargetSeconds}
                  disabled={generatingAvatar || submitting}
                  onChange={(e) => setAvatarTargetSeconds(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={6}>~6 s</option>
                  <option value={8}>~8 s</option>
                  <option value={10}>~10 s</option>
                  <option value={12}>~12 s</option>
                  <option value={15}>~15 s (máx.)</option>
                </select>
              </div>
              <div>
                <label htmlFor="avatar-template" className="mb-1 block text-xs text-muted">
                  Plantilla
                </label>
                <select
                  id="avatar-template"
                  value={avatarTemplate}
                  disabled={generatingAvatar || submitting}
                  onChange={(e) => setAvatarTemplate(e.target.value as AvatarTemplateValue)}
                  className={inputClass}
                >
                  {AVATAR_TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.hint}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  Usa los colores, logo, fuentes y web del Kit de marca del cliente (Administración).
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={avatarWithSubtitles}
                    disabled={generatingAvatar || submitting}
                    onChange={(e) => setAvatarWithSubtitles(e.target.checked)}
                  />
                  Subtítulos
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={avatarWithMusic}
                    disabled={generatingAvatar || submitting}
                    onChange={(e) => setAvatarWithMusic(e.target.checked)}
                  />
                  Música de fondo (baja)
                </label>
              </div>
              <button
                type="button"
                title="Genera el video del personaje y lo adjunta al post. Luego «Enviar a aprobación» (abajo)"
                disabled={
                  generatingMedia ||
                  uploadingCharacter ||
                  submitting ||
                  !characterImageUrl
                }
                onClick={() => void handleGenerateAvatar()}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {generatingAvatar
                  ? 'Generando avatar (puede tardar varios minutos)…'
                  : reelPreviewUrl && generatedDrafts
                    ? 'Volver a generar avatar'
                    : 'Generar avatar'}
              </button>
              {reelPreviewUrl && mediaMode === 'avatar' && (
                <div>
                  <video
                    src={reelPreviewUrl}
                    controls
                    className="max-h-48 w-full rounded object-contain"
                  />
                  {generatedDrafts && (
                    <button
                      type="button"
                      title="Quitar el media generado del post"
                      onClick={removeGeneratedMedia}
                      className="mt-2 text-xs text-red-600 hover:text-red-700"
                    >
                      Quitar media generado
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {mediaMode === 'upload' && (
            <div className="space-y-2 rounded-lg border border-line p-4">
              <label htmlFor="media" className="mb-1 block text-sm text-muted">
                Imagen o video desde tu equipo
              </label>
              <input
                id="media"
                type="file"
                accept={ACCEPT_MEDIA}
                onChange={(e) => handleMediaChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-ink"
              />
              <p className="text-xs text-muted">
                Imágenes hasta 10 MB · Videos hasta 50 MB (JPEG, PNG, WebP, GIF, MP4, MOV, WebM)
              </p>
              {mediaMode === 'upload' && hasVideoAttachment() && (
                <label
                  title="En Instagram se publicará como Reel; en Facebook como video de feed"
                  className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted"
                >
                  <input
                    type="checkbox"
                    checked={publishAsReel}
                    onChange={(e) => setPublishAsReel(e.target.checked)}
                  />
                  Publicar como Reel en Instagram
                </label>
              )}
            </div>
          )}

          {mediaPreview && (
            <div className="rounded-md border border-line-strong bg-surface p-2">
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
              {(mediaFile || libraryMediaItemId) && (
                <button
                  type="button"
                  title="Quitar el archivo adjunto"
                  onClick={() => {
                    handleMediaChange(null);
                    setLibraryMediaItemId(null);
                  }}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  Quitar adjunto
                </button>
              )}
            </div>
          )}
          {!mediaPreview && aiPreviewUrl && mediaMode === 'upload' && (
            <div className="rounded-md border border-line-strong bg-surface p-2">
              <img
                src={aiPreviewUrl}
                alt="Vista previa"
                className="max-h-48 w-full rounded object-contain"
              />
              <p className="mt-1 text-xs text-muted">
                {libraryMediaItemId
                  ? 'Imagen de la biblioteca (se adjuntará al guardar).'
                  : 'Imagen lista en el post.'}
              </p>
              {libraryMediaItemId && (
                <button
                  type="button"
                  onClick={() => {
                    setAiPreviewUrl(null);
                    setLibraryMediaItemId(null);
                  }}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  Quitar imagen
                </button>
              )}
            </div>
          )}
          {(mediaMode === 'reel' || publishAsReel) && hasVideoAttachment() && (
            <p className="text-xs text-muted">
              Facebook recibirá el video en feed. Solo Instagram usa formato Reel.
            </p>
          )}
        </section>

        {/* 4. Opciones */}
        <section className="space-y-3 border-t border-line pt-5" aria-labelledby="composer-opts">
          <SectionHeading id="composer-opts" step={4}>
            Opciones
          </SectionHeading>
          <div>
            <label htmlFor="place-link" className="mb-1 block text-sm text-muted">
              Ubicación (Facebook / Instagram, opcional)
            </label>
            <p className="mb-1 text-xs text-muted">
              Usa la ubicación de la página del cliente o pega el enlace (o ID) de la página de
              Facebook del lugar.
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                title="Usar la dirección de la página de Facebook del cliente"
                onClick={() => void applyOwnPagePlace()}
                disabled={resolvingPlace || !clientId}
                className={btnSecondary + ' px-3 py-2 text-sm'}
              >
                {resolvingPlace ? 'Leyendo…' : 'Ubicación de mi página'}
              </button>
              <input
                id="place-link"
                aria-label="Enlace o ID de la página de Facebook del lugar"
                value={placeLink}
                onChange={(e) => setPlaceLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void resolvePastedPlace();
                  }
                }}
                className="min-w-[12rem] flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
                placeholder="Enlace o ID de una página de Facebook (facebook.com/…)"
              />
              <button
                type="button"
                title="Usar esa página como ubicación"
                onClick={() => void resolvePastedPlace()}
                disabled={resolvingPlace || !clientId || !placeLink.trim()}
                className={btnSecondary + ' px-3 py-2 text-sm'}
              >
                Usar
              </button>
            </div>
            {placeId && placeName && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-emerald-600">
                Seleccionada: {placeName}
                <button
                  type="button"
                  onClick={() => {
                    setPlaceId(null);
                    setPlaceName(null);
                    setPlaceResults([]);
                  }}
                  className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:bg-canvas"
                >
                  Quitar
                </button>
              </p>
            )}
            {placeResults.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-auto rounded-md border border-line bg-surface text-sm">
                {placeResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-canvas"
                      onClick={() => choosePlace(p)}
                    >
                      <span className="text-ink">{p.name}</span>
                      {p.locationLabel ? (
                        <span className="ml-2 text-xs text-muted">{p.locationLabel}</span>
                      ) : null}
                      <span className="ml-2 text-xs text-muted">
                        {p.taggableOnInstagram === false ? '(FB)' : '(FB + IG)'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(mediaFile || aiPreviewUrl || mediaPreview || generatedDrafts) && (
            <StoryPublishCheckbox
              checked={alsoPublishAsStory}
              onChange={setAlsoPublishAsStory}
              className="text-sm"
            />
          )}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button
            type="button"
            title="Guarda el post como borrador sin enviar a aprobación"
            disabled={submitting || generatingMedia}
            onClick={(e) => handleSubmit(e, false)}
            className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            title="Envía el post a la bandeja de Aprobaciones (un post por red)"
            disabled={submitting || generatingMedia}
            onClick={(e) => handleSubmit(e, true)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Enviar a aprobación'}
          </button>
          {generatingMedia && <span className="text-xs text-brand">{waitingMediaLabel}</span>}
          {!generatingMedia && selectedAccounts.length === 0 && accounts.length > 0 && (
            <span className="text-xs text-muted">Marca al menos una red arriba.</span>
          )}
        </div>
      </form>

      {clientId && (
        <LibraryPicker
          clientId={clientId}
          kind={libraryPicker === 'media' ? 'media' : 'text'}
          open={libraryPicker !== null}
          onClose={() => setLibraryPicker(null)}
          onSelect={(item) => {
            if (item.kind === 'text') applyLibraryText(item);
            else applyLibraryMedia(item);
          }}
        />
      )}
    </div>
  );
}
