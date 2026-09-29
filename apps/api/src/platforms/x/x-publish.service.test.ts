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
  it('publica un tweet de texto sin media', async () => {
    const x = {
      createTweet: vi.fn().mockResolvedValue({ id: 't1' }),
      uploadImage: vi.fn(),
    };
    const storage = { readBytesFromUrl: vi.fn() };
    const service = new XPublishService(x as never, storage as never);
    const result = await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'Hola desde CM',
      postId: 'post-1',
    });
    expect(x.createTweet).toHaveBeenCalledWith('tok', 'Hola desde CM', {
      inReplyToTweetId: undefined,
      mediaIds: undefined,
    });
    expect(x.uploadImage).not.toHaveBeenCalled();
    expect(result.platformPostId).toBe('t1');
  });

  it('sube imagen y la adjunta al primer tweet', async () => {
    const png = Buffer.alloc(64, 1);
    const x = {
      createTweet: vi.fn().mockResolvedValue({ id: 't1' }),
      uploadImage: vi.fn().mockResolvedValue({ id: 'm1' }),
    };
    const storage = {
      readBytesFromUrl: vi.fn().mockResolvedValue({
        buffer: png,
        contentType: 'image/png',
      }),
    };
    const service = new XPublishService(x as never, storage as never);
    await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'Con foto',
      postId: 'post-img',
      imageUrls: ['https://cdn.example.com/a.png'],
    });
    expect(storage.readBytesFromUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/a.png',
    );
    expect(x.uploadImage).toHaveBeenCalled();
    expect(x.createTweet).toHaveBeenCalledWith('tok', 'Con foto', {
      inReplyToTweetId: undefined,
      mediaIds: ['m1'],
    });
  });

  it('falla la publicación si la imagen no se puede subir (no solo texto)', async () => {
    const x = {
      createTweet: vi.fn(),
      uploadImage: vi.fn().mockRejectedValue(new Error('Token sin media.write: reconectar cuenta X')),
    };
    const storage = {
      readBytesFromUrl: vi.fn().mockResolvedValue({
        buffer: Buffer.alloc(64, 1),
        contentType: 'image/jpeg',
      }),
    };
    const service = new XPublishService(x as never, storage as never);
    await expect(
      service.publish({
        platform: 'x',
        externalAccountId: 'u1',
        accessToken: 'tok',
        message: 'Con foto',
        imageUrl: 'https://cdn.example.com/a.jpg',
      }),
    ).rejects.toThrow(/media.write/i);
    expect(x.createTweet).not.toHaveBeenCalled();
  });

  it('publica hilo cuando el caption supera el límite', async () => {
    const x = {
      createTweet: vi
        .fn()
        .mockResolvedValueOnce({ id: 'root' })
        .mockResolvedValueOnce({ id: 'reply' }),
      uploadImage: vi.fn(),
    };
    const service = new XPublishService(x as never, {
      readBytesFromUrl: vi.fn(),
    } as never);
    const message = 'a'.repeat(300);
    const result = await service.publish({
      platform: 'x',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message,
    });
    expect(x.createTweet).toHaveBeenCalledTimes(2);
    expect(result.platformPostId).toBe('root');
  });

  it('marca story como skipped si alsoPublishAsStory', async () => {
    const x = { createTweet: vi.fn().mockResolvedValue({ id: 't1' }), uploadImage: vi.fn() };
    const service = new XPublishService(x as never, {
      readBytesFromUrl: vi.fn(),
    } as never);
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
