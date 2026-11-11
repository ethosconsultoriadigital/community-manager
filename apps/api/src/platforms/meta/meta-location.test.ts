import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FB_VIDEO_NO_PLACE_NOTE, MetaPublishService } from './meta-publish.service';
import { MetaGraphClient } from './meta-graph.client';
import { MetaPlacesService, parseFacebookPageRef } from './meta-places.service';

vi.mock('@cm/shared', async (orig) => ({
  ...(await orig<object>()),
  decryptToken: (enc: string) => `tok-${enc}`,
}));

function publisher(meta: object) {
  return new MetaPublishService(meta as never, { composeStoryImage: vi.fn() } as never);
}

describe('parseFacebookPageRef', () => {
  it('entiende IDs, usuarios y enlaces de Facebook', () => {
    expect(parseFacebookPageRef('123456789')).toEqual({ kind: 'id', value: '123456789' });
    expect(parseFacebookPageRef('@cafecentro')).toEqual({ kind: 'username', value: 'cafecentro' });
    expect(parseFacebookPageRef('https://www.facebook.com/cafecentro/')).toEqual({
      kind: 'username',
      value: 'cafecentro',
    });
    expect(parseFacebookPageRef('facebook.com/profile.php?id=100064123456789')).toEqual({
      kind: 'id',
      value: '100064123456789',
    });
    expect(parseFacebookPageRef('https://facebook.com/pages/Cafe-Centro/987654321')).toEqual({
      kind: 'id',
      value: '987654321',
    });
    expect(parseFacebookPageRef('https://m.facebook.com/Cafe-Centro-112233445566')).toEqual({
      kind: 'id',
      value: '112233445566',
    });
    expect(parseFacebookPageRef('https://facebook.com/groups/abc')).toBeNull();
    expect(parseFacebookPageRef('https://example.com/abc')).toBeNull();
    expect(parseFacebookPageRef('')).toBeNull();
  });
});

describe('MetaGraphClient.getPagePlace', () => {
  it('lee nombre, dirección y coordenadas de la Page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '55',
        name: 'Ethos',
        location: { street: 'Av. Vallarta 1', city: 'Guadalajara', country: 'Mexico', latitude: 20.6, longitude: -103.3 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MetaGraphClient({ get: () => 'x' } as never);
    const info = await client.getPagePlace('page-token', '55');
    expect(info).toEqual({
      id: '55',
      name: 'Ethos',
      hasLocation: true,
      locationLabel: 'Av. Vallarta 1, Guadalajara, Mexico',
      taggableOnInstagram: true,
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/55?');
    expect(url).toContain('fields=id%2Cname%2Clocation');
    vi.unstubAllGlobals();
  });
});

describe('MetaPlacesService', () => {
  function service(meta: Partial<Record<'getPagePlace' | 'searchPlaces', ReturnType<typeof vi.fn>>>) {
    const accounts = {
      findByAgency: vi.fn().mockResolvedValue([
        { id: 'acc-1', platform: 'facebook', is_active: true, external_account_id: 'page-1' },
      ]),
      findByIdWithToken: vi.fn().mockResolvedValue({ access_token_enc: 'enc' }),
    };
    const config = {
      get: (k: string) =>
        ({ TOKEN_ENCRYPTION_KEY: 'k', META_APP_ID: 'app', META_APP_SECRET: 'sec' })[k],
    };
    return new MetaPlacesService(config as never, meta as never, accounts as never);
  }

  it('usa la Page del cliente si tiene dirección', async () => {
    const getPagePlace = vi.fn().mockResolvedValue({
      id: 'page-1',
      name: 'Ethos',
      hasLocation: true,
      locationLabel: 'Guadalajara',
      taggableOnInstagram: true,
    });
    const out = await service({ getPagePlace }).ownPagePlaces('ag', 'cl');
    expect(getPagePlace).toHaveBeenCalledWith('tok-enc', 'page-1');
    expect(out.places).toEqual([
      { id: 'page-1', name: 'Ethos', locationLabel: 'Guadalajara', taggableOnInstagram: true, verified: true },
    ]);
  });

  it('avisa en español si la Page del cliente no tiene dirección', async () => {
    const getPagePlace = vi.fn().mockResolvedValue({
      id: 'page-1',
      name: 'Ethos',
      hasLocation: false,
      taggableOnInstagram: false,
    });
    const out = await service({ getPagePlace }).ownPagePlaces('ag', 'cl');
    expect(out.places).toEqual([]);
    expect(out.message).toContain('no tiene dirección');
  });

  it('un ID pegado que Meta no deja leer se acepta sin verificar', async () => {
    const getPagePlace = vi.fn().mockRejectedValue(new Error('(#10) requires Page Public Metadata Access'));
    const place = await service({ getPagePlace }).resolvePlace('ag', 'cl', '123456789');
    expect(place).toMatchObject({ id: '123456789', verified: false });
  });

  it('un usuario que Meta no deja leer pide el ID numérico', async () => {
    const getPagePlace = vi.fn().mockRejectedValue(new Error('(#10) requires Page Public Metadata Access'));
    await expect(
      service({ getPagePlace }).resolvePlace('ag', 'cl', 'https://facebook.com/cafecentro'),
    ).rejects.toThrow(/ID numérico/);
  });

  it('la búsqueda sin permiso devuelve el aviso claro', async () => {
    const searchPlaces = vi.fn().mockRejectedValue(new Error('(#10) This endpoint requires the Page Public Content Access feature'));
    const err = await service({ searchPlaces })
      .searchForClient('ag', 'cl', 'Guadalajara')
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('Ubicación de mi página');
  });
});

describe('Publicar con ubicación', () => {
  const base = { externalAccountId: 'acc', accessToken: 't', message: 'Hola' };

  it('Facebook foto manda place', async () => {
    const meta = { publishFacebookPhoto: vi.fn().mockResolvedValue({ id: 'fb-1' }) };
    const out = await publisher(meta).publish({
      platform: 'facebook',
      ...base,
      imageUrl: 'https://x/img.png',
      placeId: 'page-9',
    });
    expect(meta.publishFacebookPhoto).toHaveBeenCalledWith('acc', 't', 'https://x/img.png', 'Hola', 'page-9');
    expect(out).toEqual({ platformPostId: 'fb-1' });
  });

  it('si Facebook rechaza el lugar, publica sin él y deja nota', async () => {
    const meta = {
      publishFacebookPhoto: vi
        .fn()
        .mockRejectedValueOnce(new Error('(#100) Invalid place'))
        .mockResolvedValueOnce({ id: 'fb-2' }),
    };
    const out = await publisher(meta).publish({
      platform: 'facebook',
      ...base,
      imageUrl: 'https://x/img.png',
      placeId: 'page-9',
    });
    expect(meta.publishFacebookPhoto).toHaveBeenLastCalledWith('acc', 't', 'https://x/img.png', 'Hola', undefined);
    expect(out.platformPostId).toBe('fb-2');
    expect(out.locationNote).toContain('sin ubicación');
  });

  it('Facebook video no manda place y lo anota', async () => {
    const meta = { publishFacebookVideo: vi.fn().mockResolvedValue({ id: 'fb-v' }) };
    const out = await publisher(meta).publish({
      platform: 'facebook',
      ...base,
      videoUrl: 'https://x/v.mp4',
      placeId: 'page-9',
    });
    expect(meta.publishFacebookVideo).toHaveBeenCalledWith('acc', 't', 'https://x/v.mp4', 'Hola');
    expect(out.locationNote).toBe(FB_VIDEO_NO_PLACE_NOTE);
  });

  it('Instagram manda location_id', async () => {
    const meta = {
      createInstagramMedia: vi.fn().mockResolvedValue({ id: 'c1' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-1' }),
    };
    const out = await publisher(meta).publish({
      platform: 'instagram',
      ...base,
      imageUrl: 'https://x/img.png',
      placeId: 'page-9',
    });
    expect(meta.createInstagramMedia).toHaveBeenCalledWith('acc', 't', 'https://x/img.png', 'Hola', 'page-9');
    expect(out).toEqual({ platformPostId: 'ig-1' });
  });

  it('si Instagram rechaza la ubicación (sin coordenadas), publica sin ella una sola vez', async () => {
    const meta = {
      createInstagramMedia: vi
        .fn()
        .mockRejectedValueOnce(new Error('INSTAGRAM_PLATFORM_API__INVALID_LOCATION_ID'))
        .mockResolvedValueOnce({ id: 'c2' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-2' }),
    };
    const out = await publisher(meta).publish({
      platform: 'instagram',
      ...base,
      imageUrl: 'https://x/img.png',
      placeId: 'page-9',
    });
    expect(meta.createInstagramMedia).toHaveBeenLastCalledWith('acc', 't', 'https://x/img.png', 'Hola', undefined);
    expect(meta.publishInstagramMedia).toHaveBeenCalledTimes(1);
    expect(meta.publishInstagramMedia).toHaveBeenCalledWith('acc', 't', 'c2');
    expect(out.platformPostId).toBe('ig-2');
    expect(out.locationNote).toContain('coordenadas');
  });

  it('sin ubicación no cambia nada', async () => {
    const meta = {
      createInstagramMedia: vi.fn().mockResolvedValue({ id: 'c3' }),
      waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
      publishInstagramMedia: vi.fn().mockResolvedValue({ id: 'ig-3' }),
    };
    const out = await publisher(meta).publish({ platform: 'instagram', ...base, imageUrl: 'https://x/i.png' });
    expect(meta.createInstagramMedia).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ platformPostId: 'ig-3' });
  });
});
