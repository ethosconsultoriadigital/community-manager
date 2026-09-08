import { describe, expect, it, vi } from 'vitest';
import { MetaGraphClient } from './meta-graph.client';

describe('MetaGraphClient.searchPlaces', () => {
  it('llama a /pages/search sin type=place y marca IG si hay coordenadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: '1',
            name: 'Café Centro',
            location: { city: 'CDMX', country: 'Mexico', latitude: 19.4, longitude: -99.1 },
          },
          {
            id: '2',
            name: 'Sin coords',
            location: { city: 'CDMX' },
          },
          {
            id: '3',
            name: 'Sin location',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MetaGraphClient({ get: () => 'x' } as never);
    const places = await client.searchPlaces('token', 'cafe');

    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/pages/search?');
    expect(url).not.toContain('type=place');
    expect(url).toContain('q=cafe');

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({
      id: '1',
      name: 'Café Centro',
      taggableOnInstagram: true,
    });
    expect(places[1]).toMatchObject({
      id: '2',
      taggableOnInstagram: false,
    });

    vi.unstubAllGlobals();
  });
});
