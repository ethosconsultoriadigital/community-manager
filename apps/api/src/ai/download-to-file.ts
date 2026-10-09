import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/**
 * Descarga una URL a disco por streaming (evita Buffer gigante en heap).
 */
export async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CommunityManager/1.0' },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar (${response.status}): ${url}`);
  }
  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}
