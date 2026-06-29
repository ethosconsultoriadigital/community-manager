import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptToken } from '@cm/shared';
import { createPrismaClient, disconnectPrisma } from '../client';
import { AgenciesRepository } from './agencies.repository';
import { ClientsRepository } from './clients.repository';
import { SocialAccountsRepository } from './social-accounts.repository';

const KEY = randomBytes(32).toString('base64');
const prisma = createPrismaClient();
const agenciesRepo = new AgenciesRepository(prisma);
const clientsRepo = new ClientsRepository(prisma);
const socialRepo = new SocialAccountsRepository(prisma);

const suffix = Date.now();

describe('SocialAccountsRepository', () => {
  let agencyAId: string;
  let agencyBId: string;
  let clientAId: string;
  let accountAId: string;

  beforeAll(async () => {
    agencyAId = (await agenciesRepo.create(`Social A ${suffix}`)).id;
    agencyBId = (await agenciesRepo.create(`Social B ${suffix}`)).id;
    clientAId = (await clientsRepo.create(agencyAId, { name: `Client ${suffix}` })).id;

    const encrypted = encryptToken('meta-page-token-secret', KEY);
    const account = await socialRepo.upsert({
      agencyId: agencyAId,
      clientId: clientAId,
      platform: 'facebook',
      externalAccountId: `fb-page-${suffix}`,
      username: 'demo_page',
      accessTokenEnc: encrypted,
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      scopes: ['pages_manage_posts'],
    });
    accountAId = account.id;
  });

  afterAll(async () => {
    await prisma.social_accounts.deleteMany({
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

  it('no expone access_token_enc en consultas públicas', async () => {
    const account = await socialRepo.findById(agencyAId, accountAId);
    expect(account).not.toBeNull();
    expect(account).not.toHaveProperty('access_token_enc');
  });

  it('almacena token cifrado (no legible en DB)', async () => {
    const raw = await prisma.social_accounts.findUnique({ where: { id: accountAId } });
    const stored = raw!.access_token_enc;
    expect(stored.toString('utf8')).not.toContain('meta-page-token-secret');
    expect(stored.length).toBeGreaterThan(20);
  });

  it('aisla cuentas por agency_id', async () => {
    const forA = await socialRepo.findByAgency(agencyAId);
    const forB = await socialRepo.findByAgency(agencyBId);
    expect(forA.map((a) => a.id)).toContain(accountAId);
    expect(forB).toHaveLength(0);
  });

  it('no desconecta cuenta de otra agencia', async () => {
    const revoked = encryptToken('revoked', KEY);
    const result = await socialRepo.disconnect(agencyBId, accountAId, revoked);
    expect(result.count).toBe(0);

    const account = await socialRepo.findById(agencyAId, accountAId);
    expect(account?.is_active).toBe(true);
  });

  it('desconecta cuenta: is_active=false y token sustituido', async () => {
    const revoked = encryptToken('revoked', KEY);
    const result = await socialRepo.disconnect(agencyAId, accountAId, revoked);
    expect(result.count).toBe(1);

    const account = await socialRepo.findById(agencyAId, accountAId);
    expect(account?.is_active).toBe(false);

    const raw = await prisma.social_accounts.findUnique({ where: { id: accountAId } });
    expect(raw!.access_token_enc.toString('utf8')).not.toContain('meta-page-token-secret');
    expect(raw!.refresh_token_enc).toBeNull();
    expect(raw!.scopes).toEqual([]);
  });
});
