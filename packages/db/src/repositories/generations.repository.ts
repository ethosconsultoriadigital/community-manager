import type {
  generation_kind,
  generation_status,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export type CreateGenerationData = {
  kind: generation_kind;
  prompt?: string;
  postId?: string;
  model?: string;
};

export class GenerationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByPost(agencyId: string, postId: string) {
    return this.prisma.generations.findMany({
      where: scopedWhere(agencyId, { post_id: postId }),
      orderBy: { created_at: 'asc' },
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.generations.findFirst({
      where: scopedWhere(agencyId, { id }),
    });
  }

  create(agencyId: string, data: CreateGenerationData) {
    return this.prisma.generations.create({
      data: {
        kind: data.kind,
        prompt: data.prompt,
        model: data.model,
        status: 'pending',
        agencies: { connect: { id: agencyId } },
        ...(data.postId ? { posts: { connect: { id: data.postId } } } : {}),
      },
    });
  }

  async updateStatus(
    agencyId: string,
    id: string,
    status: generation_status,
    data?: {
      output?: Prisma.InputJsonValue;
      mediaId?: string;
      postId?: string;
      model?: string;
    },
  ) {
    const result = await this.prisma.generations.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: {
        status,
        ...(data?.output !== undefined ? { output: data.output } : {}),
        ...(data?.model !== undefined ? { model: data.model } : {}),
        ...(data?.mediaId ? { media_id: data.mediaId } : {}),
        ...(data?.postId ? { post_id: data.postId } : {}),
        ...(status === 'completed' || status === 'failed'
          ? { completed_at: new Date() }
          : {}),
      },
    });
    if (result.count === 0) return null;
    return this.findById(agencyId, id);
  }

  async linkPost(agencyId: string, id: string, postId: string) {
    const result = await this.prisma.generations.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: { post_id: postId },
    });
    return result.count > 0;
  }
}
