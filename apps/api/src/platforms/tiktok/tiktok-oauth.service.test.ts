import { describe, expect, it, vi } from 'vitest';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokOAuthStateInvalidError } from './tiktok.types';

function mockConfig() {
  return {
    get: (key: string) =>
      ({
        TIKTOK_PUBLISH_ENABLED: 'true',
        TIKTOK_CLIENT_KEY: 'key',
        TIKTOK_CLIENT_SECRET: 'secret',
        TIKTOK_REDIRECT_URI: 'http://localhost:4000/oauth/tiktok/callback',
        FRONTEND_URL: 'http://localhost:3000',
        TOKEN_ENCRYPTION_KEY: 'LOtineAVzgu+1LOiC1h/DjEF/eZssGNta/WuG02Ryco=',
      })[key],
  };
}

describe('TikTokOAuthService', () => {
  it('genera authorize URL con state de 43 chars y scopes por coma', async () => {
    const stateStore = { save: vi.fn().mockResolvedValue(undefined), consume: vi.fn() };
    const tiktok = {
      buildOAuthUrl: vi.fn((redirect: string, state: string) => {
        const params = new URLSearchParams({
          client_key: 'key',
          scope: 'user.info.basic,video.upload,video.publish',
          state,
          redirect_uri: redirect,
        });
        return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
      }),
    };
    const service = new TikTokOAuthService(
      mockConfig() as never,
      tiktok as never,
      stateStore as never,
      { findById: vi.fn().mockResolvedValue({ id: 'c1' }) } as never,
      {} as never,
      { assertClientAccess: vi.fn() } as never,
    );

    const url = await service.startConnect(
      { id: 'u1', agencyId: 'a1', role: 'owner', email: 'a@b.com' },
      'c1',
    );

    const savedState = stateStore.save.mock.calls[0][0] as string;
    expect(savedState).toHaveLength(43);
    expect(url).toContain('scope=user.info.basic%2Cvideo.upload%2Cvideo.publish');
    expect(url).toContain(`state=${savedState}`);
  });

  it('rechaza callback si el state ya fue consumido', async () => {
    const service = new TikTokOAuthService(
      mockConfig() as never,
      {} as never,
      { consume: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.handleCallback('code', 'state')).rejects.toBeInstanceOf(
      TikTokOAuthStateInvalidError,
    );
  });
});
