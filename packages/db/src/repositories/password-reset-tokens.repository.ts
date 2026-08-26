import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export class PasswordResetTokensRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, rawToken: string, expiresAt: Date) {
    await this.prisma.password_reset_tokens.deleteMany({ where: { user_id: userId } });
    return this.prisma.password_reset_tokens.create({
      data: {
        user_id: userId,
        token_hash: hashResetToken(rawToken),
        expires_at: expiresAt,
      },
    });
  }

  findValidByRawToken(rawToken: string) {
    const tokenHash = hashResetToken(rawToken);
    return this.prisma.password_reset_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            agency_id: true,
            is_active: true,
          },
        },
      },
    });
  }

  async markUsed(id: string) {
    await this.prisma.password_reset_tokens.update({
      where: { id },
      data: { used_at: new Date() },
    });
  }
}
