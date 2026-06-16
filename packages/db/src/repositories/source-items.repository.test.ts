import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ClientsRepository } from './clients.repository';
import { ContentSourcesRepository } from './content-sources.repository';
import { SourceItemsRepository } from './source-items.repository';

const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const sourcesRepo = new ContentSourcesRepository(prisma);
const itemsRepo = new SourceItemsRepository(prisma);

const suffix = Date.now();

describe('SourceItemsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let sourceAId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Items A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Items B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client ${suffix}` })).id;
    const source = await sourcesRepo.create(agencyAId, {
      clientId: clientAId,
      type: 'sheet',
      name: 'Mock Sheet',
      minScore: 0.7,
    });
    sourceAId = source.id;
  });

  afterAll(async () => {
    await prisma.source_items.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.content_sources.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.clients.deleteMany({
      where: { agency_id: { in: [agencyAId, agencyBId] } },
    });
    await prisma.agencies.deleteMany({
      where: { id: { in: [agencyAId, agencyBId] } },
    });
    await disconnectPrisma();
  });

  it('upserta items y filtra por min_score', async () => {
    await itemsRepo.upsert(agencyAId, {
      sourceId: sourceAId,
      clientId: clientAId,
      externalId: `ext-high-${suffix}`,
      title: 'Alta relevancia',
      sentimentScore: 0.85,
      dedupHash: `hash-high-${suffix}`,
    });
    await itemsRepo.upsert(agencyAId, {
      sourceId: sourceAId,
      clientId: clientAId,
      externalId: `ext-low-${suffix}`,
      title: 'Baja relevancia',
      sentimentScore: 0.4,
      dedupHash: `hash-low-${suffix}`,
    });

    const filtered = await itemsRepo.findBySource(agencyAId, sourceAId, { minScore: 0.7 });
    expect(filtered.some((i) => i.external_id === `ext-high-${suffix}`)).toBe(true);
    expect(filtered.some((i) => i.external_id === `ext-low-${suffix}`)).toBe(false);
  });

  it('aisla items por agency_id', async () => {
    const item = await itemsRepo.upsert(agencyAId, {
      sourceId: sourceAId,
      clientId: clientAId,
      externalId: `ext-iso-${suffix}`,
      sentimentScore: 0.9,
      dedupHash: `hash-iso-${suffix}`,
    });

    const forB = await itemsRepo.findById(agencyBId, item.id);
    expect(forB).toBeNull();
  });
});
