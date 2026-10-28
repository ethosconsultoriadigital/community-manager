import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApprovalsRepository,
  ContentSourcesRepository,
  MediaAssetsRepository,
  PostsRepository,
  SocialAccountsRepository,
  SourceItemsRepository,
} from '@cm/db';
import { buildRadarCaption } from '@cm/shared';
import { MediaStorageService } from '../media/media-storage.service';
import { isGoogleDriveFileUrl, parseDriveFileId } from './aab-columns';
import {
  downloadDriveFile,
  getGoogleAccessToken,
  parseServiceAccountJson,
} from './google-sheets-auth';
import { resolveSheetProfile, type SheetProfile } from './map-sheet-rows';
import { SUPPLIED_STORY_POSITION } from '../platforms/meta/story-asset';
import { trimThreadsText } from '../platforms/threads/trim-threads-text';

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
  return buildRadarCaption(parts);
}

function readConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  return config as Record<string, unknown>;
}

/** null = sin lista (primera cuenta activa de cada red, como RadarMex). */
export function readSocialAccountAllowlist(config: Record<string, unknown>): string[] | null {
  if (!Object.prototype.hasOwnProperty.call(config, 'socialAccountIds')) return null;
  if (!Array.isArray(config.socialAccountIds)) return null;
  return [
    ...new Set(
      config.socialAccountIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
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
    private readonly contentSources: ContentSourcesRepository,
    private readonly config: ConfigService,
  ) {}

  async promoteSource(
    agencyId: string,
    userId: string | null,
    sourceId: string,
  ): Promise<AutoPromoteResult> {
    const source = await this.contentSources.findById(agencyId, sourceId);
    const config = readConfig(source?.config);
    const columnMap = resolveSheetProfile(config.columnMap);
    const allowlist = readSocialAccountAllowlist(config);
    const items = await this.sourceItems.findPromotable(agencyId, sourceId, {
      requireSourceUrl: columnMap !== 'aab',
    });
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
        const created = await this.promoteItemPlatforms(
          agencyId,
          userId,
          item,
          columnMap,
          allowlist,
        );
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
    columnMap: SheetProfile,
    allowlist: string[] | null,
  ) {
    const accounts = await this.socialAccounts.findByAgency(agencyId, item.client_id);
    const active = accounts.filter((a) => a.is_active);

    // TikTok no entra: Content Posting exige un video y el Radar solo trae texto/imagen.
    const platforms: Array<{
      platform: 'facebook' | 'instagram' | 'threads' | 'x';
      copy: string | null | undefined;
    }> = [
      { platform: 'facebook', copy: item.copy_facebook },
      { platform: 'instagram', copy: item.copy_instagram },
      // RadarMex: Threads reutiliza post_x. AAB tiene columna post_threads.
      {
        platform: 'threads',
        copy:
          columnMap === 'aab'
            ? item.copy_threads
            : item.copy_x?.trim() || item.copy_facebook?.trim() || item.copy_instagram,
      },
      // X: solo columna post_x (texto corto)
      { platform: 'x', copy: item.copy_x },
    ];

    let skippedNoAccount = 0;
    let skippedNoCopy = 0;
    const postIds: string[] = [];
    let storageUrl: string | null = null;
    let storyStorageUrl: string | null = null;

    if (item.image_url) {
      storageUrl = await this.resolveStorageUrl(agencyId, item.image_url, item.external_id);
    }

    if (columnMap === 'aab') {
      const rawStory = await this.sourceItems.readStoryImageUrl?.(agencyId, item.id);
      if (rawStory) {
        storyStorageUrl = await this.downloadImageOrNull(agencyId, rawStory, item.external_id);
        if (!storyStorageUrl) {
          this.logger.warn(
            `Portada de historia no disponible para ${item.external_id}; Facebook e Instagram salen sin story`,
          );
        }
      }
    }

    for (const { platform, copy } of platforms) {
      const text = copy?.trim();
      if (!text) {
        skippedNoCopy += 1;
        continue;
      }
      const account = active.find(
        (a) => a.platform === platform && (allowlist === null || allowlist.includes(a.id)),
      );
      if (!account) {
        skippedNoAccount += 1;
        continue;
      }

      const rawCaption = buildCaption({
        copy: text,
        hashtags: item.hashtags ?? [],
        // RadarMex: url_radarmex. AAB: url_blog o, si no hay, url_original.
        url: item.source_url?.trim() || null,
      });
      const caption = platform === 'threads' ? trimThreadsText(rawCaption) : rawCaption;
      const withStory =
        columnMap === 'aab' &&
        (platform === 'facebook' || platform === 'instagram') &&
        Boolean(storyStorageUrl);

      const post = await this.posts.create(
        agencyId,
        userId,
        {
          clientId: item.client_id,
          caption,
          hashtags: item.hashtags ?? [],
          socialAccountIds: [account.id],
          contentSourceId: item.source_id,
          ...(withStory ? { alsoPublishAsStory: true } : {}),
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

      if (withStory && storyStorageUrl) {
        await this.mediaAssets.create(agencyId, {
          postId: post.id,
          type: 'image',
          source: 'upload',
          storageUrl: storyStorageUrl,
          width: 1080,
          height: 1920,
          position: SUPPLIED_STORY_POSITION,
        });
      }

      await this.approvals.createPending(post.id);
      postIds.push(post.id);
    }

    if (postIds.length > 0) {
      if (columnMap === 'aab') {
        await this.sourceItems.linkPosts(agencyId, item.id, postIds);
      } else {
        await this.sourceItems.linkPost(agencyId, item.id, postIds[0]);
      }
    }

    return { postIds, skippedNoAccount, skippedNoCopy };
  }

  private async downloadImageOrNull(
    agencyId: string,
    imageUrl: string,
    externalId: string,
  ): Promise<string | null> {
    try {
      if (isGoogleDriveFileUrl(imageUrl)) {
        return await this.downloadDriveToStorage(agencyId, imageUrl);
      }
      return await this.downloadToStorage(agencyId, imageUrl);
    } catch (err) {
      this.logger.warn(
        `No se pudo copiar imagen de ${externalId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async resolveStorageUrl(
    agencyId: string,
    imageUrl: string,
    externalId: string,
  ): Promise<string | null> {
    if (isGoogleDriveFileUrl(imageUrl)) {
      try {
        return await this.downloadDriveToStorage(agencyId, imageUrl);
      } catch (err) {
        this.logger.warn(
          `No se pudo copiar imagen de Drive de ${externalId}: ${err instanceof Error ? err.message : err}`,
        );
        return null;
      }
    }

    try {
      return await this.downloadToStorage(agencyId, imageUrl);
    } catch (err) {
      this.logger.warn(
        `No se pudo copiar imagen de ${externalId}: ${err instanceof Error ? err.message : err}`,
      );
      return imageUrl;
    }
  }

  private async downloadDriveToStorage(agencyId: string, imageUrl: string): Promise<string> {
    const fileId = parseDriveFileId(imageUrl);
    if (!fileId) throw new Error('URL de Drive sin id de archivo');
    const saRaw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!saRaw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON para leer Drive');
    const token = await getGoogleAccessToken(parseServiceAccountJson(saRaw));
    const { buffer, mimeType } = await downloadDriveFile(token, fileId);
    const extension = guessExtension(mimeType, imageUrl);
    const stored = await this.mediaStorage.save({
      agencyId,
      buffer,
      extension,
      contentType: mimeType.split(';')[0],
    });
    return stored.storageUrl;
  }

  private async downloadToStorage(agencyId: string, imageUrl: string): Promise<string> {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'CommunityManager/1.0' },
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
