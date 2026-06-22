import { describe, expect, it } from 'vitest';
import { parseCanvaDesignId, readCanvaBrandConfig } from './canva.types';

describe('canva.types', () => {
  it('parsea design id desde URL de Canva', () => {
    expect(
      parseCanvaDesignId('https://www.canva.com/design/DAF123abc/edit'),
    ).toBe('DAF123abc');
    expect(parseCanvaDesignId('DAF123abc')).toBe('DAF123abc');
  });

  it('lee brand.canva del cliente', () => {
    expect(
      readCanvaBrandConfig({
        canva: {
          brandTemplateId: 'tpl-99',
          textField: 'HEADLINE',
          imageField: 'PHOTO',
        },
      }),
    ).toEqual({
      brandTemplateId: 'tpl-99',
      textField: 'HEADLINE',
      imageField: 'PHOTO',
    });
  });
});
