import type { PrismaClient } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class ApprovalsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  hasApproved(agencyId: string, postId: string) {
    return this.prisma.approvals.findFirst({
      where: {
        post_id: postId,
        status: 'approved',
        posts: scopedWhere(agencyId, { id: postId }),
      },
    });
  }

  findLatest(agencyId: string, postId: string) {
    return this.prisma.approvals.findFirst({
      where: {
        post_id: postId,
        posts: scopedWhere(agencyId, { id: postId }),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  createPending(postId: string) {
    return this.prisma.approvals.create({
      data: { post_id: postId, status: 'pending' },
    });
  }

  async approveLatest(agencyId: string, postId: string, reviewerId: string | null) {
    const pending = await this.prisma.approvals.findFirst({
      where: {
        post_id: postId,
        status: 'pending',
        posts: scopedWhere(agencyId, { id: postId }),
      },
      orderBy: { created_at: 'desc' },
    });
    if (!pending) return null;

    return this.prisma.approvals.update({
      where: { id: pending.id },
      data: { status: 'approved', reviewer_id: reviewerId },
    });
  }

  async rejectLatest(
    agencyId: string,
    postId: string,
    reviewerId: string | null,
    comment?: string,
  ) {
    const pending = await this.prisma.approvals.findFirst({
      where: {
        post_id: postId,
        status: 'pending',
        posts: scopedWhere(agencyId, { id: postId }),
      },
      orderBy: { created_at: 'desc' },
    });
    if (!pending) return null;

    return this.prisma.approvals.update({
      where: { id: pending.id },
      data: { status: 'rejected', reviewer_id: reviewerId, comment },
    });
  }
}
