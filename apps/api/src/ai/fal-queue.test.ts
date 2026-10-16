import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatFalError, runFalQueueJob } from './fal-queue';

describe('formatFalError', () => {
  it('serializa objetos en lugar de [object Object]', () => {
    expect(formatFalError({ msg: 'bad input' })).toBe('bad input');
    expect(formatFalError([{ msg: 'a' }, { message: 'b' }])).toBe('a; b');
  });
});

describe('runFalQueueJob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.FAL_QUEUE_MAX_WAIT_MS;
    delete process.env.FAL_QUEUE_POLL_MS;
  });

  it('completa cuando fal pasa a COMPLETED', async () => {
    process.env.FAL_QUEUE_POLL_MS = '1000';
    process.env.FAL_QUEUE_MAX_WAIT_MS = '60000';
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status_url: 'https://fal.test/status',
            response_url: 'https://fal.test/response',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'IN_PROGRESS' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ status: 'COMPLETED', response_url: 'https://fal.test/response' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ video: { url: 'https://cdn/v.mp4' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const pending = runFalQueueJob({
      apiKey: 'k',
      model: 'fal-ai/test',
      body: { prompt: 'x' },
      failLabel: 'Reel',
    });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ video: { url: 'https://cdn/v.mp4' } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('incluye el detalle cuando fal marca FAILED', async () => {
    process.env.FAL_QUEUE_POLL_MS = '1000';
    process.env.FAL_QUEUE_MAX_WAIT_MS = '60000';
    vi.useFakeTimers();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              status_url: 'https://fal.test/status',
              response_url: 'https://fal.test/response',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              status: 'FAILED',
              error: { message: 'Exhausted balance' },
            }),
        }),
    );

    const pending = runFalQueueJob({
      apiKey: 'k',
      model: 'fal-ai/test',
      body: { prompt: 'x' },
      failLabel: 'Reel',
    });
    const assertion = pending.then(
      () => {
        throw new Error('debía fallar');
      },
      (err: Error) => err.message,
    );
    await vi.runAllTimersAsync();
    await expect(assertion).resolves.toMatch(/Exhausted balance/);
  });
});
