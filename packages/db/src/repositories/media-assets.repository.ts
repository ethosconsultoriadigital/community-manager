import type { media_source, media_type, PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export type CreateMediaAssetData = {
  postId?: string;
  type: media_type;
  source: media_source;
  storageUrl: string;
  width?: number;
  height?: number;
  position?: number;
};

export class MediaAssetsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByPost(agencyId: string, postId: string) {
    return this.prisma.media_assets.findMany({
      where: scopedWhere(agencyId, { post_id: postId }),
      orderBy: { position: 'asc' },
    });
  }

  create(agencyId: string, data: CreateMediaAssetData) {
    return this.prisma.media_assets.create({
      data: {
        type: data.type,
        source: data.source,
        storage_url: data.storageUrl,
        width: data.width,
        height: data.height,
        position: data.position ?? 0,
        agencies: { connect: { id: agencyId } },
        ...(data.postId ? { posts: { connect: { id: data.postId } } } : {}),
      },
    });
  }
}
