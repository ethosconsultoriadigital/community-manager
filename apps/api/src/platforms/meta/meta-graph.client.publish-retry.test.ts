import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaGraphClient, isMediaNotReadyError } from './meta-graph.client';

function graphResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

describe('MetaGraphClient.publishInstagramMedia', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reintenta cuando Instagram responde "Media ID is not available" (9007)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        graphResponse(
          { error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } },
          false,
        ),
      )
      .mockResolvedValueOnce(graphResponse({ id: 'ig-media-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MetaGraphClient({ get: () => 'x' } as never);
    client.mediaPublishRetryDelaysMs = [0, 0];
    const result = await client.publishInstagramMedia('ig-user', 'token', 'container');

    expect(result.id).toBe('ig-media-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta otros errores (p. ej. "User access is restricted")', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        graphResponse({ error: { message: 'User access is restricted', code: 10 } }, false),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MetaGraphClient({ get: () => 'x' } as never);
    client.mediaPublishRetryDelaysMs = [0, 0];
    await expect(
      client.publishInstagramMedia('ig-user', 'token', 'container'),
    ).rejects.toThrow('User access is restricted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras agotar los reintentos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        graphResponse({ error: { message: 'Media ID is not available', code: 9007 } }, false),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MetaGraphClient({ get: () => 'x' } as never);
    client.mediaPublishRetryDelaysMs = [0, 0];
    await expect(
      client.publishInstagramMedia('ig-user', 'token', 'container'),
    ).rejects.toThrow('Media ID is not available');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('isMediaNotReadyError reconoce código y mensaje', () => {
    expect(isMediaNotReadyError(Object.assign(new Error('x'), { code: 9007 }))).toBe(true);
    expect(isMediaNotReadyError(new Error('Media ID is not available'))).toBe(true);
    expect(isMediaNotReadyError(new Error('User access is restricted'))).toBe(false);
  });
});
