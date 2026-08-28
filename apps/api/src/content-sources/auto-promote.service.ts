import { Injectable, Logger } from '@nestjs/common';
import {
  ApprovalsRepository,
  MediaAssetsRepository,
  PostsRepository,
  SocialAccountsRepository,
  SourceItemsRepository,
} from '@cm/db';
import { MediaStorageService } from '../media/media-storage.service';

export type AutoPromoteResult = {
  itemsConsidered: number;
  postsCreated: number;
  skippedNoAccount: number;
  skippedNoCopy: number;
  errors: string[];
  postIds: string[];
};

function buildCaption(parts: {
  copy: string;
  hashtags: string[];
  url?: string | null;
}): string {
  const blocks = [parts.copy.trim()];
  if (parts.hashtags.length > 0) {
    blocks.push(parts.hashtags.join(' '));
  }
  if (parts.url?.trim()) {
    blocks.push(parts.url.trim());
  }
  return blocks.filter(Boolean).join('\n\n');
}

function guessExtension(contentType: string, url: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(\?|$)/);
  return m?.[1]?.replace('jpeg', 'jpg') ?? 'jpg';
}

@Injectable()
export class AutoPromoteService {
  private readonly logger = new Logger(AutoPromoteService.name);

  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly posts: PostsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly socialAccounts: SocialAccountsRepository,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async promoteSource(
    agencyId: string,
    userId: string | null,
    sourceId: string,
  ): Promise<AutoPromoteResult> {
    const items = await this.sourceItems.findPromotable(agencyId, sourceId);
    const result: AutoPromoteResult = {
      itemsConsidered: items.length,
      postsCreated: 0,
      skippedNoAccount: 0,
      skippedNoCopy: 0,
      errors: [],
      postIds: [],
    };

    for (const item of items) {
      try {
        const created = await this.promoteItemPlatforms(agencyId, userId, item);
        result.postsCreated += created.postIds.length;
        result.postIds.push(...created.postIds);
        result.skippedNoAccount += created.skippedNoAccount;
        result.skippedNoCopy += created.skippedNoCopy;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Auto-promote item ${item.id}: ${msg}`);
        result.errors.push(`${item.external_id}: ${msg}`);
      }
    }

    return result;
  }

  private async promoteItemPlatforms(
    agencyId: string,
    userId: string | null,
    item: Awaited<ReturnType<SourceItemsRepository['findPromotable']>>[number],
  ) {
    const accounts = await this.socialAccounts.findByAgency(agencyId, item.client_id);
    const active = accounts.filter((a) => a.is_active);

    const platforms: Array<{
      platform: 'facebook' | 'instagram';
      copy: string | null | undefined;
    }> = [
      { platform: 'facebook', copy: item.copy_facebook },
      { platform: 'instagram', copy: item.copy_instagram },
    ];

    let skippedNoAccount = 0;
    let skippedNoCopy = 0;
    const postIds: string[] = [];
    let storageUrl: string | null = null;

    if (item.image_url) {
      try {
        storageUrl = await this.downloadToStorage(agencyId, item.image_url);
      } catch (err) {
        this.logger.warn(
          `No se pudo copiar imagen de ${item.external_id}: ${err instanceof Error ? err.message : err}`,
        );
        storageUrl = item.image_url;
      }
    }

    for (const { platform, copy } of platforms) {
      const text = copy?.trim();
      if (!text) {
        skippedNoCopy += 1;
        continue;
      }
      const account = active.find((a) => a.platform === platform);
      if (!account) {
        skippedNoAccount += 1;
        continue;
      }

      const caption = buildCaption({
        copy: text,
        hashtags: item.hashtags ?? [],
        // item.source_url solo guarda url_radarmex tras la ingesta
        url: item.source_url?.trim() || null,
      });

      const post = await this.posts.create(
        agencyId,
        userId,
        {
          clientId: item.client_id,
          caption,
          hashtags: item.hashtags ?? [],
          socialAccountIds: [account.id],
          contentSourceId: item.source_id,
        },
        'pending_approval',
      );

      if (storageUrl) {
        await this.mediaAssets.create(agencyId, {
          postId: post.id,
          type: 'image',
          source: 'upload',
          storageUrl,
        });
      }

      await this.approvals.createPending(post.id);
      postIds.push(post.id);
    }

    if (postIds.length > 0) {
      await this.sourceItems.linkPost(agencyId, item.id, postIds[0]);
    }

    return { postIds, skippedNoAccount, skippedNoCopy };
  }

  private async downloadToStorage(agencyId: string, imageUrl: string): Promise<string> {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'CommunityManagerAutomatico/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al descargar imagen`);
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL no es imagen (${contentType})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      throw new Error('Imagen vacía o demasiado pequeña');
    }
    const extension = guessExtension(contentType, imageUrl);
    const stored = await this.mediaStorage.save({
      agencyId,
      buffer,
      extension,
      contentType: contentType.split(';')[0],
    });
    return stored.storageUrl;
  }
}
