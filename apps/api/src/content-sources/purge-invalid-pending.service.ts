import { Injectable } from '@nestjs/common';
import { PostsRepository, SourceItemsRepository } from '@cm/db';
import { calendarDateInTz, looksLikeRadarmexUrl, toCalendarDate } from './radarmex-columns';

export type PurgePendingMode = 'invalid_url' | 'stale' | 'all_radar' | 'all';

export type PurgePendingResult = {
  scanned: number;
  deleted: number;
  kept: number;
  mode: PurgePendingMode;
};

/**
 * Limpieza de posts pending_approval (sobre todo del Radar).
 * - invalid_url: sin URL Radarmex
 * - stale: Radar cuya fecha de captura/creación no es hoy (CDMX)
 * - all_radar: todos los pendientes con content_source_id
 * - all: todos los pending_approval del alcance
 */
@Injectable()
export class PurgeInvalidPendingService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly sourceItems: SourceItemsRepository,
  ) {}

  async purge(
    agencyId: string,
    clientId?: string,
    mode: PurgePendingMode = 'invalid_url',
  ): Promise<PurgePendingResult> {
    if (mode === 'all_radar') {
      const deleted = await this.posts.deleteManyPendingApproval(agencyId, {
        clientId,
        radarOnly: true,
      });
      return { scanned: deleted, deleted, kept: 0, mode };
    }

    if (mode === 'all') {
      const deleted = await this.posts.deleteManyPendingApproval(agencyId, {
        clientId,
      });
      return { scanned: deleted, deleted, kept: 0, mode };
    }

    const all = await this.posts.findAll(agencyId, clientId);
    const pending = all.filter((p) => p.status === 'pending_approval');
    const today = calendarDateInTz(new Date());

    if (mode === 'stale') {
      const radarPending = pending.filter((p) => p.content_source_id);
      const ids = radarPending.map((p) => p.id);
      const linkedItems = await this.sourceItems.findByPostIds(agencyId, ids);
      const byPostId = new Map(linkedItems.map((i) => [i.post_id as string, i]));

      const toDelete: string[] = [];
      let kept = 0;

      for (const post of pending) {
        if (!post.content_source_id) {
          kept += 1;
          continue;
        }
        const linked = byPostId.get(post.id);
        const day =
          toCalendarDate(linked?.captured_at) ?? calendarDateInTz(new Date(post.created_at));

        if (day === today) {
          kept += 1;
        } else {
          toDelete.push(post.id);
        }
      }

      const deleted = await this.posts.deleteManyPendingApproval(agencyId, {
        clientId,
        ids: toDelete,
      });
      return { scanned: pending.length, deleted, kept, mode };
    }

    // invalid_url (comportamiento original, solo Radar)
    const radarPending = pending.filter((p) => p.content_source_id);
    const ids = radarPending.map((p) => p.id);
    const linkedItems = await this.sourceItems.findByPostIds(agencyId, ids);
    const byPostId = new Map(linkedItems.map((i) => [i.post_id as string, i]));
    const toDelete: string[] = [];
    let kept = 0;

    for (const post of radarPending) {
      const captionUrl = extractFirstUrl(post.caption);
      let ok = looksLikeRadarmexUrl(captionUrl);
      if (!ok) {
        const linked = byPostId.get(post.id);
        ok = Boolean(linked?.source_url?.trim()) || looksLikeRadarmexUrl(linked?.source_url);
      }
      if (ok) {
        kept += 1;
        continue;
      }
      toDelete.push(post.id);
    }

    const deleted = await this.posts.deleteManyPendingApproval(agencyId, {
      clientId,
      ids: toDelete,
    });
    return { scanned: radarPending.length, deleted, kept, mode };
  }
}

function extractFirstUrl(caption: string | null): string | null {
  if (!caption) return null;
  const m = caption.match(/https?:\/\/[^\s)]+/i);
  return m?.[0] ?? null;
}
