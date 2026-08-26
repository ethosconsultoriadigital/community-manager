import type { user_role, PrismaClient } from '@prisma/client';

export type CreateUserData = {
  agencyId: string;
  email: string;
  passwordHash: string;
  fullName?: string;
  role?: user_role;
};

export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string) {
    return this.prisma.users.findFirst({
      where: { email: email.toLowerCase() },
      include: { agencies: true },
    });
  }

  findById(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      include: { agencies: true },
    });
  }

  findByAgency(agencyId: string) {
    return this.prisma.users.findMany({
      where: { agency_id: agencyId },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        agency_id: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  findByIdInAgency(agencyId: string, id: string) {
    return this.prisma.users.findFirst({
      where: { agency_id: agencyId, id },
      include: { agencies: true },
    });
  }

  async updatePasswordHash(agencyId: string, userId: string, passwordHash: string) {
    const result = await this.prisma.users.updateMany({
      where: { agency_id: agencyId, id: userId },
      data: { password_hash: passwordHash, updated_at: new Date() },
    });
    return result.count > 0;
  }

  async updatePasswordHashById(userId: string, passwordHash: string) {
    const result = await this.prisma.users.updateMany({
      where: { id: userId },
      data: { password_hash: passwordHash, updated_at: new Date() },
    });
    return result.count > 0;
  }

  async setActive(agencyId: string, userId: string, isActive: boolean) {
    const result = await this.prisma.users.updateMany({
      where: { agency_id: agencyId, id: userId },
      data: { is_active: isActive, updated_at: new Date() },
    });
    return result.count > 0;
  }

  async updateProfile(
    agencyId: string,
    userId: string,
    data: { fullName?: string; role?: user_role },
  ) {
    const updateData: {
      full_name?: string | null;
      role?: user_role;
      updated_at: Date;
    } = { updated_at: new Date() };

    if (data.fullName !== undefined) {
      updateData.full_name = data.fullName.trim() || null;
    }
    if (data.role !== undefined) {
      updateData.role = data.role;
    }

    const result = await this.prisma.users.updateMany({
      where: { agency_id: agencyId, id: userId, role: { not: 'owner' } },
      data: updateData,
    });
    return result.count > 0;
  }

  async deleteInAgency(agencyId: string, userId: string) {
    const result = await this.prisma.users.deleteMany({
      where: { agency_id: agencyId, id: userId, role: { not: 'owner' } },
    });
    return result.count > 0;
  }

  create(data: CreateUserData) {
    return this.prisma.users.create({
      data: {
        email: data.email.toLowerCase(),
        password_hash: data.passwordHash,
        full_name: data.fullName,
        role: data.role ?? 'manager',
        agencies: { connect: { id: data.agencyId } },
      },
      include: { agencies: true },
    });
  }
}
