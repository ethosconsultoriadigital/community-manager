import { describe, expect, it, vi } from 'vitest';
import { PlatformPublisherRegistry } from './platform-publisher.registry';

function makeRegistry(opts?: {
  configGet?: (key: string) => string | undefined;
  meta?: { publish: ReturnType<typeof vi.fn> };
  threads?: { publish: ReturnType<typeof vi.fn> };
  x?: { publish: ReturnType<typeof vi.fn> };
}) {
  const config = { get: opts?.configGet ?? (() => undefined) };
  return new PlatformPublisherRegistry(
    config as never,
    (opts?.meta ?? { publish: vi.fn() }) as never,
    (opts?.threads ?? { publish: vi.fn() }) as never,
    (opts?.x ?? { publish: vi.fn() }) as never,
  );
}

describe('PlatformPublisherRegistry', () => {
  it('devuelve Meta para facebook e instagram', () => {
    const meta = { publish: vi.fn() };
    const registry = makeRegistry({ meta });
    expect(registry.getPublisher('facebook')).toBe(meta);
    expect(registry.getPublisher('instagram')).toBe(meta);
  });

  it('exige flag Threads activo', () => {
    const registry = makeRegistry();
    expect(() => registry.getPublisher('threads')).toThrow(/desactivada/i);
  });

  it('devuelve Threads cuando está habilitado', () => {
    const threads = { publish: vi.fn() };
    const registry = makeRegistry({
      threads,
      configGet: (key) =>
        ({
          THREADS_PUBLISH_ENABLED: 'true',
          THREADS_APP_ID: '1',
          THREADS_APP_SECRET: 's',
          THREADS_REDIRECT_URI: 'http://cb',
        })[key],
    });
    expect(registry.getPublisher('threads')).toBe(threads);
  });

  it('exige flag X activo', () => {
    const registry = makeRegistry();
    expect(() => registry.getPublisher('x')).toThrow(/desactivada/i);
  });

  it('devuelve X cuando está habilitado', () => {
    const x = { publish: vi.fn() };
    const registry = makeRegistry({
      x,
      configGet: (key) =>
        ({
          X_PUBLISH_ENABLED: 'true',
          X_CLIENT_ID: 'id',
          X_CLIENT_SECRET: 'sec',
          X_REDIRECT_URI: 'http://cb',
        })[key],
    });
    expect(registry.getPublisher('x')).toBe(x);
  });

  it('tiktok aún no implementado', () => {
    const registry = makeRegistry();
    expect(() => registry.getPublisher('tiktok')).toThrow(/no implementada/i);
  });
});
