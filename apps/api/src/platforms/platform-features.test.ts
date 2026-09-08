import { describe, expect, it } from 'vitest';
import {
  getPlatformFeatures,
  isThreadsPublishEnabled,
  isPlatformPublishEnabled,
} from './platform-features';

function config(map: Record<string, string | undefined>) {
  return {
    get: (key: string) => map[key],
  };
}

describe('platform-features', () => {
  it('FB/IG siempre habilitados', () => {
    const c = config({}) as never;
    expect(isPlatformPublishEnabled(c, 'facebook')).toBe(true);
    expect(isPlatformPublishEnabled(c, 'instagram')).toBe(true);
  });

  it('Threads requiere flag y credenciales', () => {
    expect(isThreadsPublishEnabled(config({}) as never)).toBe(false);
    expect(
      isThreadsPublishEnabled(
        config({
          THREADS_PUBLISH_ENABLED: 'true',
          THREADS_APP_ID: '1',
          THREADS_APP_SECRET: 's',
          THREADS_REDIRECT_URI: 'http://localhost/cb',
        }) as never,
      ),
    ).toBe(true);
  });

  it('snapshot de features', () => {
    const snap = getPlatformFeatures(
      config({
        THREADS_PUBLISH_ENABLED: 'true',
        THREADS_APP_ID: '1',
        THREADS_APP_SECRET: 's',
        THREADS_REDIRECT_URI: 'http://x',
      }) as never,
    );
    expect(snap.facebook).toBe(true);
    expect(snap.threads).toBe(true);
    expect(snap.x).toBe(false);
    expect(snap.tiktok).toBe(false);
  });
});
