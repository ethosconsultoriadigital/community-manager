import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  SOURCE_ACCOUNTS_REQUIRED_MESSAGE,
  assertSourceAccounts,
} from './content-sources.controller';

describe('assertSourceAccounts (fuentes de Sheet exigen cuentas)', () => {
  it('rechaza guardar una fuente de Sheet sin cuentas, con mensaje en español', () => {
    for (const config of [{}, { socialAccountIds: [] }, { socialAccountIds: ['  '] }]) {
      expect(() => assertSourceAccounts('news_radar', config)).toThrow(BadRequestException);
      expect(() => assertSourceAccounts('sheet', config)).toThrow(SOURCE_ACCOUNTS_REQUIRED_MESSAGE);
    }
  });

  it('acepta fuentes con cuentas y no toca PATCH sin config ni otros tipos', () => {
    expect(() =>
      assertSourceAccounts('news_radar', { columnMap: 'aab', socialAccountIds: ['sa-aab-fb'] }),
    ).not.toThrow();
    expect(() => assertSourceAccounts('news_radar', undefined)).not.toThrow();
    expect(() => assertSourceAccounts('rss', {})).not.toThrow();
  });
});
