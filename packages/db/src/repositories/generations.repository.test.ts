import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { GenerationsRepository } from './generations.repository';

const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const generationsRepo = new GenerationsRepository(prisma);

const suffix = Date.now();

describe('GenerationsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Gen A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Gen B ${suffix}`)).id;
  });

  afterAll(async () => {
    await prisma.generations.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('registra y completa una generación de copy', async () => {
    const gen = await generationsRepo.create(agencyAId, {
      kind: 'copy',
      prompt: 'Brief de prueba',
      model: 'mock-llm',
    });

    expect(gen.status).toBe('pending');

    const completed = await generationsRepo.updateStatus(agencyAId, gen.id, 'completed', {
      output: { caption: 'Hola', hashtags: ['#test'] },
    });

    expect(completed?.status).toBe('completed');
    expect(completed?.output).toEqual({ caption: 'Hola', hashtags: ['#test'] });
  });

  it('aisla generaciones por agency_id', async () => {
    const gen = await generationsRepo.create(agencyAId, {
      kind: 'image',
      prompt: 'imagen',
    });

    const forB = await generationsRepo.findById(agencyBId, gen.id);
    expect(forB).toBeNull();
  });
});
