import { describe, expect, it, vi } from 'vitest';
import { HybridCanvaProvider } from './hybrid-canva.provider';

describe('HybridCanvaProvider', () => {
  const input = {
    brief: 'Promo',
    imageUrl: 'https://example.com/img.jpg',
    agencyId: 'agency-1',
    clientId: 'client-1',
  };

  it('usa RealCanvaProvider cuando hay acceso a Canva', async () => {
    const tokens = { hasCanvaAccess: vi.fn().mockResolvedValue(true) };
    const real = {
      composeFlyer: vi.fn().mockResolvedValue({
        url: 'https://storage.local/canva.png',
        templateId: 'tpl-1',
        provider: 'canva-connect',
      }),
    };
    const mock = { composeFlyer: vi.fn() };

    const provider = new HybridCanvaProvider(
      tokens as never,
      real as never,
      mock as never,
    );

    const result = await provider.composeFlyer(input);

    expect(real.composeFlyer).toHaveBeenCalledWith(input);
    expect(mock.composeFlyer).not.toHaveBeenCalled();
    expect(result.provider).toBe('canva-connect');
  });

  it('usa MockCanvaProvider cuando no hay acceso a Canva', async () => {
    const tokens = { hasCanvaAccess: vi.fn().mockResolvedValue(false) };
    const real = { composeFlyer: vi.fn() };
    const mock = {
      composeFlyer: vi.fn().mockResolvedValue({
        url: 'https://mock-canva.local/export/abc.png',
        templateId: 'mock-brand-template',
        provider: 'mock',
      }),
    };

    const provider = new HybridCanvaProvider(
      tokens as never,
      real as never,
      mock as never,
    );

    const result = await provider.composeFlyer(input);

    expect(mock.composeFlyer).toHaveBeenCalledWith(input);
    expect(real.composeFlyer).not.toHaveBeenCalled();
    expect(result.provider).toBe('mock');
  });
});
