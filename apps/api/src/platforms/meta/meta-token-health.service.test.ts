import { encryptToken } from '@cm/shared';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MetaTokenHealthService } from './meta-token-health.service';

const ENCRYPTION_KEY = randomBytes(32).toString('base64');

function createService() {
  const config = { get: vi.fn().mockReturnValue(ENCRYPTION_KEY) };
  const meta = { probeAccount: vi.fn() };
  const socialAccounts = {
    findActiveMetaWithToken: vi.fn(),
    updateConnectionStatus: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const service = new MetaTokenHealthService(
    config as never,
    meta as never,
    socialAccounts as never,
  );
  return { service, meta, socialAccounts };
}

describe('MetaTokenHealthService', () => {
  it('marca Requiere reconexión si Graph responde un error de permisos', async () => {
    const { service, meta, socialAccounts } = createService();
    socialAccounts.findActiveMetaWithToken.mockResolvedValue([
      {
        id: 'sa-1',
        agency_id: 'ag-1',
        platform: 'facebook',
        external_account_id: 'page-1',
        access_token_enc: encryptToken('page-token', ENCRYPTION_KEY),
      },
    ]);
    const err = new Error(
      "Any of the pages_show_list permission(s) must be granted before impersonating a user's page.",
    );
    (err as Error & { code?: number }).code = 200;
    meta.probeAccount.mockRejectedValue(err);

    const result = await service.validateActiveTokens();

    expect(result).toEqual({ checked: 1, marked: 1, failed: 0 });
    expect(socialAccounts.updateConnectionStatus).toHaveBeenCalledWith(
      'ag-1',
      'sa-1',
      'requiere_reconexion',
    );
  });

  it('no marca la cuenta si la revisión falla por un error ajeno al token', async () => {
    const { service, meta, socialAccounts } = createService();
    socialAccounts.findActiveMetaWithToken.mockResolvedValue([
      {
        id: 'sa-1',
        agency_id: 'ag-1',
        platform: 'instagram',
        external_account_id: 'ig-1',
        access_token_enc: encryptToken('page-token', ENCRYPTION_KEY),
      },
    ]);
    meta.probeAccount.mockRejectedValue(new Error('network timeout'));

    const result = await service.validateActiveTokens();

    expect(result).toEqual({ checked: 1, marked: 0, failed: 1 });
    expect(socialAccounts.updateConnectionStatus).not.toHaveBeenCalled();
  });

  it('no marca la cuenta si el token sigue siendo válido', async () => {
    const { service, meta, socialAccounts } = createService();
    socialAccounts.findActiveMetaWithToken.mockResolvedValue([
      {
        id: 'sa-1',
        agency_id: 'ag-1',
        platform: 'facebook',
        external_account_id: 'page-1',
        access_token_enc: encryptToken('page-token', ENCRYPTION_KEY),
      },
    ]);
    meta.probeAccount.mockResolvedValue({ id: 'page-1' });

    const result = await service.validateActiveTokens();

    expect(result).toEqual({ checked: 1, marked: 0, failed: 0 });
    expect(socialAccounts.updateConnectionStatus).not.toHaveBeenCalled();
  });
});
