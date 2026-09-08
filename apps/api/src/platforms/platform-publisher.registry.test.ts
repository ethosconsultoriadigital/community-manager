import { describe, expect, it, vi } from 'vitest';
import { PlatformPublisherRegistry } from './platform-publisher.registry';

describe('PlatformPublisherRegistry', () => {
  it('devuelve Meta para facebook e instagram', () => {
    const meta = { publish: vi.fn() };
    const threads = { publish: vi.fn() };
    const config = { get: vi.fn() };
    const registry = new PlatformPublisherRegistry(
      config as never,
      meta as never,
      threads as never,
    );
    expect(registry.getPublisher('facebook')).toBe(meta);
    expect(registry.getPublisher('instagram')).toBe(meta);
  });

  it('exige flag Threads activo', () => {
    const registry = new PlatformPublisherRegistry(
      { get: () => undefined } as never,
      { publish: vi.fn() } as never,
      { publish: vi.fn() } as never,
    );
    expect(() => registry.getPublisher('threads')).toThrow(/desactivada/i);
  });

  it('devuelve Threads cuando está habilitado', () => {
    const threads = { publish: vi.fn() };
    const config = {
      get: (key: string) =>
        ({
          THREADS_PUBLISH_ENABLED: 'true',
          THREADS_APP_ID: '1',
          THREADS_APP_SECRET: 's',
          THREADS_REDIRECT_URI: 'http://cb',
        })[key],
    };
    const registry = new PlatformPublisherRegistry(
      config as never,
      { publish: vi.fn() } as never,
      threads as never,
    );
    expect(registry.getPublisher('threads')).toBe(threads);
  });

  it('x y tiktok aún no implementados', () => {
    const registry = new PlatformPublisherRegistry(
      { get: () => undefined } as never,
      { publish: vi.fn() } as never,
      { publish: vi.fn() } as never,
    );
    expect(() => registry.getPublisher('x')).toThrow(/no implementada/i);
    expect(() => registry.getPublisher('tiktok')).toThrow(/no implementada/i);
  });
});
