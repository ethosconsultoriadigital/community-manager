import { describe, expect, it, vi } from 'vitest';
import { splitCaptionForTweets, XPublishService } from './x-publish.service';

describe('splitCaptionForTweets', () => {
  it('devuelve un solo chunk si cabe en 280', () => {
    expect(splitCaptionForTweets('Hola X')).toEqual(['Hola X']);
  });

  it('parte textos largos en hilo', () => {
    const long = `${'palabra '.repeat(50)}fin`;
    const parts = splitCaptionForTweets(long, 40);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(40);
    }
    expect(parts.join(' ').replace(/\s+/g, ' ')).toContain('fin');
  });

  it('usa un espacio si el caption está vacío', () => {
    expect(splitCaptionForTweets('   ')).toEqual([' ']);
  });
});

describe('XPublishService', () => {
  it('publica un tweet de texto', async () => {
    const x = {
      createTweet: vi.fn().mockResolvedValue({ id: 't1' }),
    };
    const service = new XPublishService(x as never);
    const result = await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'Hola desde CM',
    });
    expect(x.createTweet).toHaveBeenCalledWith('tok', 'Hola desde CM', undefined);
    expect(result.platformPostId).toBe('t1');
  });

  it('publica hilo cuando el caption supera el límite', async () => {
    const x = {
      createTweet: vi
        .fn()
        .mockResolvedValueOnce({ id: 'root' })
        .mockResolvedValueOnce({ id: 'reply' }),
    };
    const service = new XPublishService(x as never);
    const message = 'a'.repeat(300);
    const result = await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message,
    });
    expect(x.createTweet).toHaveBeenCalledTimes(2);
    expect(x.createTweet).toHaveBeenNthCalledWith(1, 'tok', expect.any(String), undefined);
    expect(x.createTweet).toHaveBeenNthCalledWith(2, 'tok', expect.any(String), 'root');
    expect(result.platformPostId).toBe('root');
  });

  it('marca story como skipped si alsoPublishAsStory', async () => {
    const x = { createTweet: vi.fn().mockResolvedValue({ id: 't1' }) };
    const service = new XPublishService(x as never);
    const result = await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'x',
      alsoPublishAsStory: true,
    });
    expect(result.storyStatus).toBe('skipped');
  });
});
