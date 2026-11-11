import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAL_BALANCE_MESSAGE,
  friendlyFalError,
  isFalBalanceError,
  runFalQueueJob,
} from './fal-queue';

describe('saldo agotado en fal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconoce los mensajes reales de fal', () => {
    expect(
      isFalBalanceError(
        'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
      ),
    ).toBe(true);
    expect(isFalBalanceError('User is locked. Reason: TOP_UP.')).toBe(true);
    expect(isFalBalanceError('No face detected in the image')).toBe(false);
    expect(isFalBalanceError(undefined)).toBe(false);
  });

  it('friendlyFalError traduce solo el error de saldo', () => {
    expect(
      friendlyFalError('No se pudo iniciar lip-sync: User is locked. Reason: Exhausted balance.'),
    ).toBe(FAL_BALANCE_MESSAGE);
    expect(friendlyFalError('Otro error')).toBe('Otro error');
  });

  it('runFalQueueJob devuelve el mensaje en español al enviar sin saldo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            detail:
              'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
          }),
      }),
    );
    await expect(
      runFalQueueJob({ apiKey: 'k', model: 'fal-ai/x', body: {}, failLabel: 'Reel' }),
    ).rejects.toThrow(FAL_BALANCE_MESSAGE);
  });
});
