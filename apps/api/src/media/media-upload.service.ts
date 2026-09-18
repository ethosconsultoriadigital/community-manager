import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaAssetsRepository, PostsRepository } from '@cm/db';
import { MediaStorageService } from './media-storage.service';
import { MediaValidationError, validateUploadFile } from './media-validation';

/** Estados en los que se puede reemplazar media (bandeja y calendario). */
const EDITABLE_POST_STATUSES = new Set([
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'failed',
]);

@Injectable()
export class MediaUploadService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly storage: MediaStorageService,
  ) {}

  async uploadToPost(
    agencyId: string,
    postId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new MediaValidationError('No se recibió ningún archivo');
    }

    const post = await this.posts.findById(agencyId, postId);
    if (!post) throw new NotFoundException('Post no encontrado');
    if (!EDITABLE_POST_STATUSES.has(post.status)) {
      throw new MediaValidationError(
        'Solo se puede adjuntar media a posts editables (borrador, pendiente, aprobado, programado o con error)',
      );
    }

    const { mediaType, extension } = validateUploadFile({
      mime: file.mimetype,
      size: file.size,
      originalName: file.originalname,
    });

    await this.mediaAssets.deleteByPost(agencyId, postId);

    const stored = await this.storage.save({
      agencyId,
      buffer: file.buffer,
      extension,
      contentType: file.mimetype,
    });

    const asset = await this.mediaAssets.create(agencyId, {
      postId,
      type: mediaType,
      source: 'upload',
      storageUrl: stored.storageUrl,
      position: 0,
    });

    return asset;
  }

  /** Sube una imagen suelta (p. ej. referencia para generar Reel) sin asociarla a un post. */
  async uploadStandalone(agencyId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new MediaValidationError('No se recibió ningún archivo');
    }

    const { mediaType, extension } = validateUploadFile({
      mime: file.mimetype,
      size: file.size,
      originalName: file.originalname,
    });

    if (mediaType !== 'image') {
      throw new MediaValidationError(
        'Para referencia de Reel solo se admiten imágenes (JPEG, PNG, WebP, GIF)',
      );
    }

    const stored = await this.storage.save({
      agencyId,
      buffer: file.buffer,
      extension,
      contentType: file.mimetype,
    });

    return {
      storageUrl: stored.storageUrl,
      storageKey: stored.storageKey,
      type: 'image' as const,
      contentType: file.mimetype,
    };
  }
}
