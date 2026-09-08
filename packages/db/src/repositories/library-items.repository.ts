import type { library_item_kind, media_source, PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class LibraryItemsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryItemsValidationError';
  }
}

export type CreateLibraryItemData = {
  clientId: string;
  kind: library_item_kind;
  title?: string | null;
  caption?: string | null;
  hashtags?: string[];
  storageUrl?: string | null;
  mediaSource?: media_source | null;
  sourcePostId?: string | null;
};

function defaultTitle(kind: library_item_kind, caption?: string | null): string {
  if (kind === 'text') {
    const trimmed = (caption ?? '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return 'Texto';
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  }
  return kind === 'image' ? 'Imagen' : 'Video';
}

export class LibraryItemsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(
    agencyId: string,
    options?: { clientId?: string; kind?: library_item_kind },
  ) {
    return this.prisma.library_items.findMany({
      where: scopedWhere(agencyId, {
        ...(options?.clientId ? { client_id: options.clientId } : {}),
        ...(options?.kind ? { kind: options.kind } : {}),
      }),
      orderBy: { created_at: 'desc' },
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.library_items.findFirst({
      where: scopedWhere(agencyId, { id }),
    });
  }

  async create(agencyId: string, createdBy: string | null, data: CreateLibraryItemData) {
    const client = await this.prisma.clients.findFirst({
      where: scopedWhere(agencyId, { id: data.clientId }),
    });
    if (!client) {
      throw new LibraryItemsValidationError('Cliente no encontrado');
    }

    if (data.kind === 'text') {
      const caption = data.caption?.trim() ?? '';
      if (!caption) {
        throw new LibraryItemsValidationError('El texto no puede estar vacío');
      }
    } else {
      const url = data.storageUrl?.trim() ?? '';
      if (!url) {
        throw new LibraryItemsValidationError('La URL de media es obligatoria');
      }
    }

    return this.prisma.library_items.create({
      data: {
        kind: data.kind,
        title: data.title?.trim() || defaultTitle(data.kind, data.caption),
        caption: data.kind === 'text' ? data.caption?.trim() ?? null : data.caption ?? null,
        hashtags: data.hashtags ?? [],
        storage_url: data.kind === 'text' ? null : data.storageUrl?.trim() ?? null,
        media_source: data.kind === 'text' ? null : (data.mediaSource ?? 'upload'),
        agencies: { connect: { id: agencyId } },
        clients: { connect: { id: data.clientId } },
        ...(createdBy ? { users: { connect: { id: createdBy } } } : {}),
        ...(data.sourcePostId
          ? { posts: { connect: { id: data.sourcePostId } } }
          : {}),
      },
    });
  }

  async createFromPost(agencyId: string, postId: string, createdBy: string | null) {
    const post = await this.prisma.posts.findFirst({
      where: scopedWhere(agencyId, { id: postId }),
      include: { media_assets: { orderBy: { position: 'asc' } } },
    });
    if (!post) return null;

    const created = [];

    const caption = post.caption?.trim();
    if (caption) {
      created.push(
        await this.create(agencyId, createdBy, {
          clientId: post.client_id,
          kind: 'text',
          caption,
          hashtags: post.hashtags ?? [],
          sourcePostId: post.id,
        }),
      );
    }

    for (const asset of post.media_assets) {
      if (asset.type !== 'image' && asset.type !== 'video') continue;
      created.push(
        await this.create(agencyId, createdBy, {
          clientId: post.client_id,
          kind: asset.type,
          storageUrl: asset.storage_url,
          mediaSource: asset.source,
          caption: caption ?? null,
          sourcePostId: post.id,
          title: asset.type === 'image' ? 'Imagen del post' : 'Video del post',
        }),
      );
    }

    if (!created.length) {
      throw new LibraryItemsValidationError(
        'El post no tiene texto ni media para guardar en la biblioteca',
      );
    }

    return created;
  }

  async delete(agencyId: string, id: string) {
    const result = await this.prisma.library_items.deleteMany({
      where: scopedWhere(agencyId, { id }),
    });
    return result.count > 0;
  }

  /**
   * Adjunta un ítem de media de la biblioteca a un post (misma agency/client).
   * Si replace=true, elimina media previa del post.
   */
  async attachToPost(
    agencyId: string,
    libraryItemId: string,
    postId: string,
    options?: { replace?: boolean },
  ) {
    const item = await this.findById(agencyId, libraryItemId);
    if (!item) return null;
    if (item.kind === 'text' || !item.storage_url) {
      throw new LibraryItemsValidationError(
        'Solo se pueden adjuntar imágenes o videos de la biblioteca',
      );
    }

    const post = await this.prisma.posts.findFirst({
      where: scopedWhere(agencyId, { id: postId }),
    });
    if (!post) {
      throw new LibraryItemsValidationError('Post no encontrado');
    }
    if (post.client_id !== item.client_id) {
      throw new LibraryItemsValidationError(
        'El ítem de biblioteca pertenece a otro cliente',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (options?.replace !== false) {
        await tx.media_assets.deleteMany({
          where: { agency_id: agencyId, post_id: postId },
        });
      }

      return tx.media_assets.create({
        data: {
          type: item.kind === 'video' ? 'video' : 'image',
          source: item.media_source ?? 'upload',
          storage_url: item.storage_url!,
          position: 0,
          agencies: { connect: { id: agencyId } },
          posts: { connect: { id: postId } },
        },
      });
    });
  }
}
