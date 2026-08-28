import { Injectable } from '@nestjs/common';
import { PostsRepository, SourceItemsRepository } from '@cm/db';
import { looksLikeRadarmexUrl } from './radarmex-columns';

export type PurgePendingResult = {
  scanned: number;
  deleted: number;
  kept: number;
};

/**
 * Elimina posts pending_approval (de Radar) que no tengan URL Radarmex en caption
 * ni en el source_item enlazado.
 */
@Injectable()
export class PurgeInvalidPendingService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly sourceItems: SourceItemsRepository,
  ) {}

  async purge(agencyId: string, clientId?: string): Promise<PurgePendingResult> {
    const all = await this.posts.findAll(agencyId, clientId);
    const pending = all.filter(
      (p) => p.status === 'pending_approval' && p.content_source_id,
    );

    let deleted = 0;
    let kept = 0;

    for (const post of pending) {
      const captionUrl = extractFirstUrl(post.caption);
      let ok = looksLikeRadarmexUrl(captionUrl);

      if (!ok && post.content_source_id) {
        const items = await this.sourceItems.findBySource(
          agencyId,
          post.content_source_id,
        );
        const linked = items.find((i) => i.post_id === post.id);
        // source_url del item solo guarda url_radarmex tras la ingesta correcta
        ok = Boolean(linked?.source_url?.trim()) || looksLikeRadarmexUrl(linked?.source_url);
      }

      // Posts Radar viejos con solo URL de terceros → borrar
      if (!ok && captionUrl && !looksLikeRadarmexUrl(captionUrl)) {
        ok = false;
      }

      if (ok) {
        kept += 1;
        continue;
      }

      await this.posts.delete(agencyId, post.id);
      deleted += 1;
    }

    return { scanned: pending.length, deleted, kept };
  }
}

function extractFirstUrl(caption: string | null): string | null {
  if (!caption) return null;
  const m = caption.match(/https?:\/\/[^\s)]+/i);
  return m?.[0] ?? null;
}
