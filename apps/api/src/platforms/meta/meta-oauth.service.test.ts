import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaOAuthService } from './meta-oauth.service';

const ENCRYPTION_KEY = randomBytes(32).toString('base64');

const PAGE_AAB = {
  id: 'page-aab',
  name: 'AAB Soluciones',
  access_token: 'token-aab',
  instagram_business_account: { id: 'ig-aab', username: 'aab.ig' },
};
function createService() {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'META_REDIRECT_URI') return 'https://api.example/oauth/meta/callback';
      if (key === 'TOKEN_ENCRYPTION_KEY') return ENCRYPTION_KEY;
      if (key === 'FRONTEND_URL') return 'https://app.example';
      return undefined;
    }),
  };
  const jwt = {
    verify: vi.fn().mockReturnValue({
      sub: 'user-1',
      agencyId: 'ag-1',
      clientId: 'client-aab',
    }),
    sign: vi.fn(),
  };
  const meta = {
    exchangeCodeForToken: vi.fn().mockResolvedValue({ access_token: 'short' }),
    exchangeForLongLivedToken: vi.fn().mockResolvedValue({
      access_token: 'long',
      expires_in: 60,
    }),
    getUserPages: vi.fn().mockResolvedValue([PAGE_AAB]),
    buildOAuthUrl: vi.fn(),
  };
  const clients = {
    findById: vi.fn().mockImplementation(async (_agency: string, id: string) => {
      if (id === 'client-aab')
        return { id: 'client-aab', name: 'AAB Soluciones Informaticas' };
      if (id === 'client-ethos')
        return { id: 'client-ethos', name: 'Ethos Consultoría Digital' };
      return { id, name: 'Cliente' };
    }),
  };
  const socialAccounts = {
    findByPlatformExternalId: vi.fn().mockResolvedValue(null),
    upsert: vi
      .fn()
      .mockImplementation(
        async (data: { externalAccountId: string; platform: string }) => ({
          id: `${data.platform}-${data.externalAccountId}`,
          client_id: 'client-aab',
          platform: data.platform,
          external_account_id: data.externalAccountId,
        }),
      ),
    findActiveByClientAndPlatforms: vi.fn().mockResolvedValue([]),
    updateConnectionStatus: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const clientAccess = { assertClientAccess: vi.fn() };

  const service = new MetaOAuthService(
    config as never,
    jwt as never,
    meta as never,
    clients as never,
    socialAccounts as never,
    clientAccess as never,
  );

  return { service, meta, socialAccounts, clients };
}

describe('MetaOAuthService.handleCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('guarda las páginas del cliente actual y limpia el estado de conexión', async () => {
    const { service, socialAccounts } = createService();
    const result = await service.handleCallback('code', 'state');

    expect(socialAccounts.upsert).toHaveBeenCalledTimes(2);
    expect(socialAccounts.upsert.mock.calls[0][0]).toMatchObject({
      clientId: 'client-aab',
      platform: 'facebook',
      externalAccountId: 'page-aab',
      connectionStatus: null,
    });
    expect(socialAccounts.upsert.mock.calls[1][0]).toMatchObject({
      clientId: 'client-aab',
      platform: 'instagram',
      externalAccountId: 'ig-aab',
      connectionStatus: null,
    });
    expect(result.accounts).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it('no mueve ni sobrescribe una página que ya pertenece a otro cliente', async () => {
    const { service, socialAccounts } = createService();
    socialAccounts.findByPlatformExternalId.mockImplementation(
      async (platform: string, externalId: string) => {
        if (platform === 'facebook' && externalId === 'page-aab') {
          return {
            id: 'existing-fb',
            agency_id: 'ag-1',
            client_id: 'client-ethos',
            platform: 'facebook',
            external_account_id: 'page-aab',
            username: 'AAB Soluciones',
          };
        }
        if (platform === 'instagram' && externalId === 'ig-aab') {
          return {
            id: 'existing-ig',
            agency_id: 'ag-1',
            client_id: 'client-ethos',
            platform: 'instagram',
            external_account_id: 'ig-aab',
            username: 'aab.ig',
          };
        }
        return null;
      },
    );

    const result = await service.handleCallback('code', 'state');

    expect(socialAccounts.upsert).not.toHaveBeenCalled();
    expect(result.accounts).toHaveLength(0);
    expect(result.skipped).toEqual([
      'La página AAB Soluciones ya está conectada al cliente Ethos Consultoría Digital; no se movió',
      'La cuenta de Instagram @aab.ig ya está conectada al cliente Ethos Consultoría Digital; no se movió',
    ]);
  });

  it('marca Requiere reconexión en las cuentas del cliente que no llegaron en /me/accounts', async () => {
    const { service, socialAccounts } = createService();
    socialAccounts.findActiveByClientAndPlatforms.mockResolvedValue([
      {
        id: 'fb-aab',
        platform: 'facebook',
        external_account_id: 'page-aab',
      },
      {
        id: 'fb-remesas',
        platform: 'facebook',
        external_account_id: 'page-remesas',
      },
      {
        id: 'ig-aab',
        platform: 'instagram',
        external_account_id: 'ig-aab',
      },
    ]);

    await service.handleCallback('code', 'state');

    expect(socialAccounts.updateConnectionStatus).toHaveBeenCalledTimes(1);
    expect(socialAccounts.updateConnectionStatus).toHaveBeenCalledWith(
      'ag-1',
      'fb-remesas',
      'requiere_reconexion',
    );
  });

  it('incluye los avisos de páginas no movidas en la URL de retorno', () => {
    const { service } = createService();
    const url = service.getSuccessRedirectUrl({
      accounts: [],
      skipped: ['La página AAB ya está conectada al cliente Ethos; no se movió'],
    });
    expect(url).toContain('/cuentas?');
    expect(url).toContain('connected=meta');
    expect(url).toContain('metaSaved=0');
    const skipped = new URL(url).searchParams.get('metaSkipped');
    expect(skipped).toBe('La página AAB ya está conectada al cliente Ethos; no se movió');
  });
});
