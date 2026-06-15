import type { PrismaClient } from '@prisma/client';

export class AgenciesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(name: string) {
    return this.prisma.agencies.create({ data: { name } });
  }

  findAll() {
    return this.prisma.agencies.findMany({ orderBy: { created_at: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.agencies.findUnique({ where: { id } });
  }

  update(id: string, name: string) {
    return this.prisma.agencies.update({ where: { id }, data: { name, updated_at: new Date() } });
  }

  delete(id: string) {
    return this.prisma.agencies.delete({ where: { id } });
  }
}
