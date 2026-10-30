import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreadsApiClient, isThreadsMediaNotReadyError } from './threads-api.client';

function apiResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

describe('ThreadsApiClient.publishContainer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reintenta cuando threads_publish responde "The requested resource does not exist"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        apiResponse(
          {
            error: {
              message: 'The requested resource does not exist',
              code: 24,
              error_subcode: 4279009,
            },
          },
          false,
        ),
      )
      .mockResolvedValueOnce(apiResponse({ id: 'thread-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ThreadsApiClient({ get: () => 'x' } as never);
    client.publishRetryDelaysMs = [0, 0];
    const result = await client.publishContainer('user', 'token', 'container');

    expect(result.id).toBe('thread-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/threads_publish');
  });

  it('no reintenta errores de validación como el límite de 500', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        apiResponse({ error: { message: 'Param text must be at most 500 characters long.' } }, false),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ThreadsApiClient({ get: () => 'x' } as never);
    client.publishRetryDelaysMs = [0, 0];
    await expect(client.publishContainer('user', 'token', 'container')).rejects.toThrow(
      'at most 500',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('isThreadsMediaNotReadyError reconoce subcódigo y mensaje', () => {
    expect(isThreadsMediaNotReadyError(Object.assign(new Error('x'), { subcode: 4279009 }))).toBe(
      true,
    );
    expect(isThreadsMediaNotReadyError(new Error('The requested resource does not exist'))).toBe(
      true,
    );
    expect(isThreadsMediaNotReadyError(new Error('Invalid OAuth access token'))).toBe(false);
  });
});
