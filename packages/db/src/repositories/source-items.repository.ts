import type { item_status, Prisma, PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class SourceItemsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceItemsValidationError';
  }
}

export type UpsertSourceItemData = {
  sourceId: string;
  clientId: string;
  externalId: string;
  capturedAt?: Date | null;
  origin?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  sentiment?: string | null;
  sentimentScore?: number | null;
  sentimentReason?: string | null;
  imageUrl?: string | null;
  copyFacebook?: string | null;
  copyInstagram?: string | null;
  copyX?: string | null;
  hashtags?: string[];
  flaggedPublish?: boolean;
  dedupHash?: string | null;
  status?: item_status;
  /** No pisar post_id/status si el item ya fue promovido. */
  preservePromotion?: boolean;
};

export class SourceItemsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findBySource(
    agencyId: string,
    sourceId: string,
    options?: { minScore?: number; status?: item_status },
  ) {
    return this.prisma.source_items.findMany({
      where: scopedWhere(agencyId, {
        source_id: sourceId,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.minScore !== undefined
          ? { sentiment_score: { gte: options.minScore } }
          : {}),
      }),
      orderBy: { created_at: 'desc' },
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.source_items.findFirst({
      where: scopedWhere(agencyId, { id }),
      include: { content_sources: true },
    });
  }

  findByPostIds(agencyId: string, postIds: string[]) {
    if (postIds.length === 0) return Promise.resolve([]);
    return this.prisma.source_items.findMany({
      where: scopedWhere(agencyId, { post_id: { in: postIds } }),
    });
  }

  findByDedupHash(agencyId: string, sourceId: string, dedupHash: string) {
    return this.prisma.source_items.findFirst({
      where: scopedWhere(agencyId, { source_id: sourceId, dedup_hash: dedupHash }),
    });
  }

  findByExternalId(agencyId: string, sourceId: string, externalId: string) {
    return this.prisma.source_items.findFirst({
      where: scopedWhere(agencyId, { source_id: sourceId, external_id: externalId }),
    });
  }

  findPromotable(agencyId: string, sourceId: string) {
    const statuses: item_status[] = ['new', 'pending_approval', 'approved'];
    return this.prisma.source_items.findMany({
      where: scopedWhere(agencyId, {
        source_id: sourceId,
        post_id: null,
        flagged_publish: true,
        status: { in: statuses },
        NOT: { OR: [{ source_url: null }, { source_url: '' }] },
      }),
      orderBy: { created_at: 'desc' },
    });
  }

  async upsert(agencyId: string, data: UpsertSourceItemData) {
    if (data.dedupHash) {
      const duplicate = await this.findByDedupHash(agencyId, data.sourceId, data.dedupHash);
      if (duplicate && duplicate.external_id !== data.externalId) {
        return this.prisma.source_items.create({
          data: this.toCreateData(agencyId, { ...data, status: 'duplicate' }),
        });
      }
    }

    const existing = await this.findByExternalId(agencyId, data.sourceId, data.externalId);
    const preserve =
      data.preservePromotion ||
      Boolean(existing?.post_id) ||
      existing?.status === 'published';

    return this.prisma.source_items.upsert({
      where: {
        source_id_external_id: {
          source_id: data.sourceId,
          external_id: data.externalId,
        },
      },
      create: this.toCreateData(agencyId, data),
      update: {
        captured_at: data.capturedAt,
        origin: data.origin,
        source_url: data.sourceUrl,
        title: data.title,
        summary: data.summary,
        category: data.category,
        sentiment: data.sentiment,
        sentiment_score: data.sentimentScore,
        sentiment_reason: data.sentimentReason,
        image_url: data.imageUrl,
        copy_facebook: data.copyFacebook,
        copy_instagram: data.copyInstagram,
        copy_x: data.copyX,
        hashtags: data.hashtags ?? [],
        flagged_publish: data.flaggedPublish ?? false,
        dedup_hash: data.dedupHash,
        ...(preserve
          ? {}
          : data.status
            ? { status: data.status }
            : {}),
      },
    });
  }

  async approve(agencyId: string, id: string) {
    const item = await this.findById(agencyId, id);
    if (!item) return null;
    if (item.status === 'duplicate') {
      throw new SourceItemsValidationError('No se puede aprobar un item duplicado');
    }
    if (item.post_id) {
      throw new SourceItemsValidationError('El item ya fue promovido a un post');
    }

    const result = await this.prisma.source_items.updateMany({
      where: scopedWhere(agencyId, { id, post_id: null }),
      data: { status: 'approved' },
    });
    if (result.count === 0) return null;
    return this.findById(agencyId, id);
  }

  async linkPost(agencyId: string, id: string, postId: string) {
    const result = await this.prisma.source_items.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: { post_id: postId, status: 'published' },
    });
    return result.count > 0;
  }

  /**
   * Descarta un item ingerido (soft delete → rejected).
   * Si tiene post pending_approval, lo elimina también.
   */
  async dismiss(agencyId: string, id: string) {
    const item = await this.findById(agencyId, id);
    if (!item) return null;

    if (item.post_id) {
      const post = await this.prisma.posts.findFirst({
        where: scopedWhere(agencyId, { id: item.post_id }),
        select: { id: true, status: true },
      });
      if (post?.status === 'published') {
        throw new SourceItemsValidationError(
          'No se puede descartar: el post ya fue publicado en redes',
        );
      }
      if (post?.status === 'pending_approval') {
        await this.prisma.$transaction(async (tx) => {
          await tx.posts.deleteMany({
            where: { agency_id: agencyId, id: post.id },
          });
          await tx.source_items.updateMany({
            where: scopedWhere(agencyId, { id }),
            data: { status: 'rejected', post_id: null },
          });
        });
        return this.findById(agencyId, id);
      }
    }

    await this.prisma.source_items.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: { status: 'rejected', post_id: null },
    });
    return this.findById(agencyId, id);
  }

  private toCreateData(agencyId: string, data: UpsertSourceItemData): Prisma.source_itemsCreateInput {
    return {
      external_id: data.externalId,
      captured_at: data.capturedAt,
      origin: data.origin,
      source_url: data.sourceUrl,
      title: data.title,
      summary: data.summary,
      category: data.category,
      sentiment: data.sentiment,
      sentiment_score: data.sentimentScore,
      sentiment_reason: data.sentimentReason,
      image_url: data.imageUrl,
      copy_facebook: data.copyFacebook,
      copy_instagram: data.copyInstagram,
      copy_x: data.copyX,
      hashtags: data.hashtags ?? [],
      flagged_publish: data.flaggedPublish ?? false,
      dedup_hash: data.dedupHash,
      status: data.status ?? 'new',
      agencies: { connect: { id: agencyId } },
      clients: { connect: { id: data.clientId } },
      content_sources: { connect: { id: data.sourceId } },
    };
  }
}
