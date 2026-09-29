import { describe, expect, it, vi } from 'vitest';
import { XOAuthService } from './x-oauth.service';
import { XOAuthStateInvalidError } from './x.types';

function mockConfig(enabled = true) {
  return {
    get: (key: string) =>
      ({
        X_PUBLISH_ENABLED: enabled ? 'true' : 'false',
        X_CLIENT_ID: 'cid',
        X_CLIENT_SECRET: 'sec',
        X_REDIRECT_URI: 'http://localhost:4000/oauth/x/callback',
        FRONTEND_URL: 'http://localhost:3000',
        TOKEN_ENCRYPTION_KEY: 'LOtineAVzgu+1LOiC1h/DjEF/eZssGNta/WuG02Ryco=',
      })[key],
  };
}

describe('XOAuthService', () => {
  it('genera authorize URL con state opaco de 43 caracteres', async () => {
    const stateStore = {
      save: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn(),
    };
    const x = {
      buildOAuthUrl: vi.fn((_r, _s, state: string) => `https://x.com/auth?state=${state}`),
    };
    const service = new XOAuthService(
      mockConfig() as never,
      x as never,
      stateStore as never,
      { findById: vi.fn().mockResolvedValue({ id: 'c1' }) } as never,
      {} as never,
      {
        assertClientAccess: vi.fn(),
      } as never,
    );

    const url = await service.startConnect(
      { id: 'u1', agencyId: 'a1', role: 'owner', email: 'a@b.com' },
      'c1',
    );

    expect(stateStore.save).toHaveBeenCalledTimes(1);
    const savedState = stateStore.save.mock.calls[0][0] as string;
    expect(savedState).toHaveLength(43);
    expect(savedState).not.toContain('.');
    expect(url).toContain(`state=${savedState}`);
  });

  it('rechaza callback si el state ya fue consumido', async () => {
    const stateStore = {
      save: vi.fn(),
      consume: vi.fn().mockResolvedValueOnce(null),
    };
    const service = new XOAuthService(
      mockConfig() as never,
      { exchangeCodeForToken: vi.fn() } as never,
      stateStore as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.handleCallback('code1', 'state1')).rejects.toBeInstanceOf(
      XOAuthStateInvalidError,
    );
  });

  it('consume state una sola vez en callback exitoso', async () => {
    const pending = {
      userId: 'u1',
      agencyId: 'a1',
      clientId: 'c1',
      codeVerifier: 'verifier',
    };
    const stateStore = {
      save: vi.fn(),
      consume: vi.fn().mockResolvedValue(pending),
    };
    const x = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 7200,
        scope: 'tweet.read tweet.write',
      }),
      getMe: vi.fn().mockResolvedValue({ id: '99', username: 'user' }),
    };
    const socialAccounts = {
      upsert: vi.fn().mockResolvedValue({ id: 'sa1' }),
    };
    const service = new XOAuthService(
      mockConfig() as never,
      x as never,
      stateStore as never,
      { findById: vi.fn().mockResolvedValue({ id: 'c1' }) } as never,
      socialAccounts as never,
      {} as never,
    );

    await service.handleCallback('authcode', 'opaque-state');

    expect(stateStore.consume).toHaveBeenCalledWith('opaque-state');
    expect(x.exchangeCodeForToken).toHaveBeenCalledWith(
      'authcode',
      'http://localhost:4000/oauth/x/callback',
      'verifier',
    );
  });
});
