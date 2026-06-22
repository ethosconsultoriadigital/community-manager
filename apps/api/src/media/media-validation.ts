import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_UPLOAD_MIMES,
  ALLOWED_VIDEO_MIMES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from './media.constants';

export type UploadMediaType = 'image' | 'video';

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export function resolveMediaType(mime: string): UploadMediaType {
  if (ALLOWED_IMAGE_MIMES.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIMES.has(mime)) return 'video';
  throw new MediaValidationError(`Tipo de archivo no permitido: ${mime}`);
}

export function validateUploadFile(input: {
  mime: string;
  size: number;
  originalName?: string;
}): { mediaType: UploadMediaType; extension: string } {
  if (!ALLOWED_UPLOAD_MIMES.has(input.mime)) {
    throw new MediaValidationError(
      'Formato no permitido. Usa JPEG, PNG, WebP, GIF, MP4, MOV o WebM.',
    );
  }

  const mediaType = resolveMediaType(input.mime);
  const maxBytes = mediaType === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (input.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new MediaValidationError(
      `El archivo supera el límite de ${maxMb} MB para ${mediaType === 'image' ? 'imágenes' : 'videos'}.`,
    );
  }

  const extension = extensionFromMime(input.mime, input.originalName);
  return { mediaType, extension };
}

function extensionFromMime(mime: string, originalName?: string): string {
  const fromName = originalName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;

  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    default:
      return 'bin';
  }
}
