import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CanvaEditorService } from './canva-editor.service';

describe('CanvaEditorService', () => {
  const config = { get: (key: string) => (key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined) };

  function buildService(overrides: Partial<Record<string, unknown>> = {}) {
    const tokens = {
      isIntegrationConfigured: vi.fn().mockReturnValue(true),
      getAccessToken: vi.fn().mockResolvedValue('canva-token'),
      ...overrides.tokens,
    };
    const canva = {
      createSocialDesign: vi.fn().mockResolvedValue({
        id: 'design-1',
        urls: { edit_url: 'https://www.canva.com/api/design/design-1/edit' },
      }),
      buildEditUrl: vi.fn().mockReturnValue('https://canva.test/edit?correlation_state=post-1'),
      exportDesignPng: vi.fn().mockResolvedValue('https://export.canva.test/out.png'),
      downloadBinary: vi.fn().mockResolvedValue(Buffer.from('png')),
      ...overrides.canva,
    };
    const returnJwt = {
      verifyCorrelationJwt: vi.fn().mockResolvedValue({
        design_id: 'design-1',
        correlation_state: 'post-1',
        aud: 'client',
        exp: 0,
        sub: 'user',
        type: 'rti',
      }),
      ...overrides.returnJwt,
    };
    const posts = {
      findById: vi.fn().mockResolvedValue({
        id: 'post-1',
        status: 'draft',
        caption: 'Hola',
      }),
      findByIdForCanvaReturn: vi.fn().mockResolvedValue({
        id: 'post-1',
        agency_id: 'agency-1',
        status: 'draft',
      }),
      ...overrides.posts,
    };
    const mediaAssets = {
      deleteByPost: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'media-1' }),
      ...overrides.mediaAssets,
    };
    const mediaStorage = {
      save: vi.fn().mockResolvedValue({ storageUrl: 'https://storage.test/img.png' }),
      ...overrides.mediaStorage,
    };

    return new CanvaEditorService(
      config as never,
      tokens as never,
      canva as never,
      returnJwt as never,
      posts as never,
      mediaAssets as never,
      mediaStorage as never,
    );
  }

  it('createEditUrl devuelve editUrl con diseño nuevo', async () => {
    const service = buildService();
    const result = await service.createEditUrl('agency-1', 'post-1');

    expect(result.designId).toBe('design-1');
    expect(result.editUrl).toContain('correlation_state');
  });

  it('createEditUrl rechaza post no editable', async () => {
    const service = buildService({
      posts: {
        findById: vi.fn().mockResolvedValue({ id: 'post-1', status: 'published', caption: 'x' }),
      },
    });

    await expect(service.createEditUrl('agency-1', 'post-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handleReturn exporta PNG y guarda media', async () => {
    const service = buildService();
    const result = await service.handleReturn('jwt-token');

    expect(result.postId).toBe('post-1');
    expect(result.storageUrl).toBe('https://storage.test/img.png');
  });

  it('handleReturn rechaza post inexistente', async () => {
    const service = buildService({
      posts: { findByIdForCanvaReturn: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.handleReturn('jwt-token')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getFrontendErrorUrl codifica el mensaje', () => {
    const service = buildService();
    const url = service.getFrontendErrorUrl('falló algo');
    expect(url).toContain('canva_error=');
    expect(url).toContain(encodeURIComponent('falló algo'));
  });
});
