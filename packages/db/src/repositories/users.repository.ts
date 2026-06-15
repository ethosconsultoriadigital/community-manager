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
        created_at: true,
        updated_at: true,
      },
    });
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
