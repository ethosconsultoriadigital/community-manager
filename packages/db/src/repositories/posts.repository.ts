import type { post_status, Prisma, PrismaClient, target_status } from '@prisma/client';
import { scopedWhere } from '../tenant/tenant-scope';

export class PostsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostsValidationError';
  }
}

export type CreatePostData = {
  clientId: string;
  caption?: string;
  hashtags?: string[];
  socialAccountIds: string[];
};

export type UpdatePostData = {
  caption?: string;
  hashtags?: string[];
  socialAccountIds?: string[];
};

const postInclude = {
  post_targets: {
    include: {
      social_accounts: {
        select: {
          id: true,
          platform: true,
          external_account_id: true,
          username: true,
          client_id: true,
        },
      },
    },
  },
} satisfies Prisma.postsInclude;

const publishInclude = {
  ...postInclude,
  media_assets: { orderBy: { position: 'asc' as const } },
  approvals: { where: { status: 'approved' as const }, take: 1 },
} satisfies Prisma.postsInclude;

export class PostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(agencyId: string, clientId?: string) {
    return this.prisma.posts.findMany({
      where: scopedWhere(agencyId, clientId ? { client_id: clientId } : undefined),
      orderBy: { created_at: 'desc' },
      include: postInclude,
    });
  }

  findById(agencyId: string, id: string) {
    return this.prisma.posts.findFirst({
      where: scopedWhere(agencyId, { id }),
      include: postInclude,
    });
  }

  async create(
    agencyId: string,
    createdBy: string | null,
    data: CreatePostData,
    status: post_status = 'draft',
  ) {
    if (!data.socialAccountIds.length) {
      throw new PostsValidationError('Debe indicar al menos un destino');
    }

    const client = await this.prisma.clients.findFirst({
      where: scopedWhere(agencyId, { id: data.clientId }),
    });
    if (!client) {
      throw new PostsValidationError('Cliente no encontrado');
    }

    await this.assertSocialAccountsBelongToClient(
      agencyId,
      data.clientId,
      data.socialAccountIds,
    );

    return this.prisma.$transaction(async (tx) => {
      const post = await tx.posts.create({
        data: {
          caption: data.caption,
          hashtags: data.hashtags ?? [],
          status,
          agencies: { connect: { id: agencyId } },
          clients: { connect: { id: data.clientId } },
          ...(createdBy ? { users: { connect: { id: createdBy } } } : {}),
        },
      });

      await tx.post_targets.createMany({
        data: data.socialAccountIds.map((socialAccountId) => ({
          post_id: post.id,
          social_account_id: socialAccountId,
        })),
      });

      return tx.posts.findFirstOrThrow({
        where: { id: post.id },
        include: postInclude,
      });
    });
  }

  async update(agencyId: string, id: string, data: UpdatePostData) {
    const existing = await this.findById(agencyId, id);
    if (!existing) return null;

    if (data.socialAccountIds !== undefined) {
      if (!data.socialAccountIds.length) {
        throw new PostsValidationError('Debe indicar al menos un destino');
      }
      await this.assertSocialAccountsBelongToClient(
        agencyId,
        existing.client_id,
        data.socialAccountIds,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.posts.updateMany({
        where: scopedWhere(agencyId, { id }),
        data: {
          ...(data.caption !== undefined ? { caption: data.caption } : {}),
          ...(data.hashtags !== undefined ? { hashtags: data.hashtags } : {}),
          updated_at: new Date(),
        },
      });

      if (data.socialAccountIds !== undefined) {
        await tx.post_targets.deleteMany({ where: { post_id: id } });
        await tx.post_targets.createMany({
          data: data.socialAccountIds.map((socialAccountId) => ({
            post_id: id,
            social_account_id: socialAccountId,
          })),
        });
      }

      return tx.posts.findFirst({
        where: scopedWhere(agencyId, { id }),
        include: postInclude,
      });
    });
  }

  async delete(agencyId: string, id: string) {
    const result = await this.prisma.posts.deleteMany({
      where: scopedWhere(agencyId, { id }),
    });
    return result.count > 0;
  }

  async submitForApproval(agencyId: string, id: string) {
    const post = await this.findById(agencyId, id);
    if (!post) return null;
    if (!['draft', 'pending_approval'].includes(post.status)) {
      throw new PostsValidationError(
        'Solo se pueden enviar a aprobación posts en borrador',
      );
    }

    await this.prisma.posts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: { status: 'pending_approval', updated_at: new Date() },
    });

    const latest = await this.prisma.approvals.findFirst({
      where: { post_id: id, status: 'pending' },
      orderBy: { created_at: 'desc' },
    });
    if (!latest) {
      await this.prisma.approvals.create({
        data: { post_id: id, status: 'pending' },
      });
    }

    return this.findById(agencyId, id);
  }

  async markApproved(agencyId: string, id: string) {
    const updated = await this.prisma.posts.updateMany({
      where: {
        agency_id: agencyId,
        id,
        status: 'pending_approval',
      },
      data: { status: 'approved', updated_at: new Date() },
    });
    if (updated.count === 0) return null;
    return this.findById(agencyId, id);
  }

  async markRejected(agencyId: string, id: string) {
    const updated = await this.prisma.posts.updateMany({
      where: {
        agency_id: agencyId,
        id,
        status: 'pending_approval',
      },
      data: { status: 'draft', updated_at: new Date() },
    });
    if (updated.count === 0) return null;
    return this.findById(agencyId, id);
  }

  async schedule(agencyId: string, id: string, scheduledAt: Date) {
    const post = await this.findById(agencyId, id);
    if (!post) return null;

    if (!['approved', 'scheduled'].includes(post.status)) {
      throw new PostsValidationError('El post debe estar aprobado para programarlo');
    }

    const approval = await this.prisma.approvals.findFirst({
      where: {
        post_id: id,
        status: 'approved',
        posts: scopedWhere(agencyId, { id }),
      },
    });
    if (!approval) {
      throw new PostsValidationError('Se requiere una aprobación humana previa');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new PostsValidationError('La fecha de programación debe ser futura');
    }

    await this.prisma.posts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: {
        status: 'scheduled',
        scheduled_at: scheduledAt,
        updated_at: new Date(),
      },
    });

    return this.findById(agencyId, id);
  }

  findDueForPublish(before: Date) {
    return this.prisma.posts.findMany({
      where: {
        status: 'scheduled',
        scheduled_at: { lte: before },
        approvals: { some: { status: 'approved' } },
      },
      select: { id: true, agency_id: true, scheduled_at: true },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  findForPublish(agencyId: string, id: string) {
    return this.prisma.posts.findFirst({
      where: scopedWhere(agencyId, { id }),
      include: publishInclude,
    });
  }

  async markPublishing(agencyId: string, id: string) {
    await this.prisma.posts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: { status: 'publishing', updated_at: new Date() },
    });
  }

  async updateTargetStatus(
    agencyId: string,
    postId: string,
    targetId: string,
    data: {
      status: target_status;
      platformPostId?: string | null;
      errorMessage?: string | null;
      incrementAttempts?: boolean;
    },
  ) {
    const target = await this.prisma.post_targets.findFirst({
      where: {
        id: targetId,
        post_id: postId,
        posts: scopedWhere(agencyId, { id: postId }),
      },
    });
    if (!target) return null;

    return this.prisma.post_targets.update({
      where: { id: targetId },
      data: {
        status: data.status,
        ...(data.platformPostId !== undefined
          ? { platform_post_id: data.platformPostId }
          : {}),
        ...(data.errorMessage !== undefined ? { error_message: data.errorMessage } : {}),
        ...(data.status === 'published' ? { published_at: new Date() } : {}),
        ...(data.incrementAttempts ? { attempts: { increment: 1 } } : {}),
      },
    });
  }

  async refreshAggregateStatus(agencyId: string, id: string) {
    const post = await this.findById(agencyId, id);
    if (!post?.post_targets.length) return null;

    const statuses = post.post_targets.map((t) => t.status);
    let status: post_status = 'publishing';

    if (statuses.every((s) => s === 'published')) {
      status = 'published';
    } else if (statuses.every((s) => s === 'failed')) {
      status = 'failed';
    } else if (statuses.some((s) => s === 'published')) {
      status = 'published';
    } else if (statuses.some((s) => s === 'publishing' || s === 'pending')) {
      status = 'publishing';
    }

    await this.prisma.posts.updateMany({
      where: scopedWhere(agencyId, { id }),
      data: {
        status,
        ...(status === 'published' ? { published_at: new Date() } : {}),
        updated_at: new Date(),
      },
    });

    return this.findById(agencyId, id);
  }

  private async assertSocialAccountsBelongToClient(
    agencyId: string,
    clientId: string,
    socialAccountIds: string[],
  ) {
    const uniqueIds = [...new Set(socialAccountIds)];
    const accounts = await this.prisma.social_accounts.findMany({
      where: scopedWhere(agencyId, {
        id: { in: uniqueIds },
        client_id: clientId,
        is_active: true,
      }),
      select: { id: true },
    });

    if (accounts.length !== uniqueIds.length) {
      throw new PostsValidationError(
        'Uno o más destinos no pertenecen al cliente o no están activos',
      );
    }
  }
}
