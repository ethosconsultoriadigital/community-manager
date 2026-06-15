import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
