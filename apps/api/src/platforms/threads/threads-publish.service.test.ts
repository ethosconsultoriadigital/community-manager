import { describe, expect, it, vi } from 'vitest';
import { ThreadsPublishService } from './threads-publish.service';

describe('ThreadsPublishService', () => {
  it('publica texto creando contenedor TEXT', async () => {
    const threads = {
      createTextContainer: vi.fn().mockResolvedValue({ id: 'c1' }),
      createImageContainer: vi.fn(),
      createVideoContainer: vi.fn(),
      waitForContainer: vi.fn(),
      publishContainer: vi.fn().mockResolvedValue({ id: 'p1' }),
    };
    const service = new ThreadsPublishService(threads as never);
    const result = await service.publish({
      platform: 'threads',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'Hola Threads',
    });
    expect(threads.createTextContainer).toHaveBeenCalledWith('u1', 'tok', 'Hola Threads');
    expect(threads.waitForContainer).not.toHaveBeenCalled();
    expect(threads.publishContainer).toHaveBeenCalledWith('u1', 'tok', 'c1');
    expect(result.platformPostId).toBe('p1');
  });

  it('publica imagen y espera contenedor', async () => {
    const threads = {
      createTextContainer: vi.fn(),
      createImageContainer: vi.fn().mockResolvedValue({ id: 'c-img' }),
      createVideoContainer: vi.fn(),
      waitForContainer: vi.fn().mockResolvedValue(undefined),
      publishContainer: vi.fn().mockResolvedValue({ id: 'p-img' }),
    };
    const service = new ThreadsPublishService(threads as never);
    const result = await service.publish({
      platform: 'threads',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'Con foto',
      imageUrl: 'https://cdn.example.com/a.jpg',
    });
    expect(threads.createImageContainer).toHaveBeenCalled();
    expect(threads.waitForContainer).toHaveBeenCalledWith('c-img', 'tok');
    expect(result.platformPostId).toBe('p-img');
  });

  it('marca story como skipped si alsoPublishAsStory', async () => {
    const threads = {
      createTextContainer: vi.fn().mockResolvedValue({ id: 'c1' }),
      createImageContainer: vi.fn(),
      createVideoContainer: vi.fn(),
      waitForContainer: vi.fn(),
      publishContainer: vi.fn().mockResolvedValue({ id: 'p1' }),
    };
    const service = new ThreadsPublishService(threads as never);
    const result = await service.publish({
      platform: 'threads',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message: 'x',
      alsoPublishAsStory: true,
    });
    expect(result.storyStatus).toBe('skipped');
  });

  it('recorta un texto largo a 500 puntos de código y publica igual', async () => {
    const threads = {
      createTextContainer: vi.fn().mockResolvedValue({ id: 'c1' }),
      createImageContainer: vi.fn(),
      createVideoContainer: vi.fn(),
      waitForContainer: vi.fn(),
      publishContainer: vi.fn().mockResolvedValue({ id: 'p1' }),
    };
    const service = new ThreadsPublishService(threads as never);
    const link = 'https://blog.example/nota';
    const message = `Primera frase. ${'Z'.repeat(600)}\n\n${link}`;
    const result = await service.publish({
      platform: 'threads',
      externalAccountId: 'u1',
      accessToken: 'tok',
      message,
    });
    const sent = threads.createTextContainer.mock.calls[0][2] as string;
    expect([...sent].length).toBeLessThanOrEqual(500);
    expect(sent).toContain(link);
    expect(sent).toContain('…');
    expect(result.platformPostId).toBe('p1');
  });
});
