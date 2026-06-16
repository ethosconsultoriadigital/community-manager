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

  findByDedupHash(agencyId: string, sourceId: string, dedupHash: string) {
    return this.prisma.source_items.findFirst({
      where: scopedWhere(agencyId, { source_id: sourceId, dedup_hash: dedupHash }),
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
        ...(data.status ? { status: data.status } : {}),
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
      where: scopedWhere(agencyId, { id, status: 'approved' as item_status }),
      data: { post_id: postId, status: 'published' },
    });
    return result.count > 0;
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
