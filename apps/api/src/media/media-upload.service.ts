import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaAssetsRepository, PostsRepository } from '@cm/db';
import { MediaStorageService } from './media-storage.service';
import { MediaValidationError, validateUploadFile } from './media-validation';

const EDITABLE_POST_STATUSES = new Set(['draft', 'pending_approval']);

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
        'Solo se puede adjuntar media a posts en borrador o pendientes de aprobación',
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
}
