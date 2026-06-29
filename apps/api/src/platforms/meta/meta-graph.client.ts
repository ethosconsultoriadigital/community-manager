import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  META_GRAPH_VERSION,
  type MetaPageAccount,
  type MetaTokenResponse,
} from './meta.types';

@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);
  private readonly graphBase = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

  constructor(private readonly config: ConfigService) {}

  buildOAuthUrl(redirectUri: string, scopes: string[], state: string): string {
    const appId = this.requireConfig('META_APP_ID');
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<MetaTokenResponse> {
    const appId = this.requireConfig('META_APP_ID');
    const appSecret = this.requireConfig('META_APP_SECRET');
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    return this.getJson<MetaTokenResponse>(`${this.graphBase}/oauth/access_token?${params}`);
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
    const appId = this.requireConfig('META_APP_ID');
    const appSecret = this.requireConfig('META_APP_SECRET');
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });
    return this.getJson<MetaTokenResponse>(`${this.graphBase}/oauth/access_token?${params}`);
  }

  async refreshLongLivedToken(currentToken: string): Promise<MetaTokenResponse> {
    return this.exchangeForLongLivedToken(currentToken);
  }

  async getUserPages(userAccessToken: string): Promise<MetaPageAccount[]> {
    const params = new URLSearchParams({
      access_token: userAccessToken,
      fields: 'id,name,access_token,instagram_business_account{id,username}',
    });
    const response = await this.getJson<{ data: MetaPageAccount[] }>(
      `${this.graphBase}/me/accounts?${params}`,
    );
    return response.data ?? [];
  }

  async publishFacebookFeed(
    pageId: string,
    accessToken: string,
    message: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      message,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(`${this.graphBase}/${pageId}/feed`, params);
  }

  async publishFacebookPhoto(
    pageId: string,
    accessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      url: imageUrl,
      caption,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(`${this.graphBase}/${pageId}/photos`, params);
  }

  async publishFacebookVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      file_url: videoUrl,
      description,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(`${this.graphBase}/${pageId}/videos`, params);
  }

  async createInstagramMedia(
    igUserId: string,
    accessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(
      `${this.graphBase}/${igUserId}/media`,
      params,
    );
  }

  async createInstagramVideoMedia(
    igUserId: string,
    accessToken: string,
    videoUrl: string,
    caption: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'VIDEO',
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(
      `${this.graphBase}/${igUserId}/media`,
      params,
    );
  }

  async createInstagramReelsMedia(
    igUserId: string,
    accessToken: string,
    videoUrl: string,
    caption: string,
    shareToFeed = true,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: shareToFeed ? 'true' : 'false',
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(
      `${this.graphBase}/${igUserId}/media`,
      params,
    );
  }

  async publishInstagramMedia(
    igUserId: string,
    accessToken: string,
    creationId: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });
    return this.postJson<{ id: string }>(
      `${this.graphBase}/${igUserId}/media_publish`,
      params,
    );
  }

  async waitForInstagramContainer(
    containerId: string,
    accessToken: string,
    maxAttempts = 40,
    delayMs = 3000,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const params = new URLSearchParams({
        fields: 'status_code',
        access_token: accessToken,
      });
      const result = await this.getJson<{ status_code?: string }>(
        `${this.graphBase}/${containerId}?${params}`,
      );
      const status = result.status_code;
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Contenedor Instagram en estado ${status}`);
      }
      await this.sleep(delayMs);
    }
    throw new Error('Tiempo de espera agotado procesando media en Instagram');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getFacebookPostMetrics(
    postId: string,
    accessToken: string,
  ): Promise<{
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    engagement?: number;
  }> {
    const fieldsParams = new URLSearchParams({
      fields: 'likes.summary(true),comments.summary(true),shares',
      access_token: accessToken,
    });
    const basic = await this.getJson<{
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>(`${this.graphBase}/${postId}?${fieldsParams}`);

    const likes = basic.likes?.summary?.total_count ?? 0;
    const comments = basic.comments?.summary?.total_count ?? 0;
    const shares = basic.shares?.count ?? 0;

    let impressions: number | undefined;
    let engagement: number | undefined;

    try {
      const insightParams = new URLSearchParams({
        metric: 'post_impressions,post_engaged_users',
        period: 'lifetime',
        access_token: accessToken,
      });
      const insights = await this.getJson<{
        data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
      }>(`${this.graphBase}/${postId}/insights?${insightParams}`);

      for (const row of insights.data ?? []) {
        const value = row.values?.[0]?.value ?? 0;
        if (row.name === 'post_impressions') impressions = value;
        if (row.name === 'post_engaged_users') engagement = value;
      }
    } catch {
      engagement = likes + comments + shares;
    }

    return { impressions, likes, comments, shares, engagement: engagement ?? likes + comments + shares };
  }

  async getInstagramMediaMetrics(
    mediaId: string,
    accessToken: string,
  ): Promise<{
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    engagement?: number;
  }> {
    const fieldsParams = new URLSearchParams({
      fields: 'like_count,comments_count',
      access_token: accessToken,
    });
    const basic = await this.getJson<{ like_count?: number; comments_count?: number }>(
      `${this.graphBase}/${mediaId}?${fieldsParams}`,
    );

    const likes = basic.like_count ?? 0;
    const comments = basic.comments_count ?? 0;

    let impressions: number | undefined;
    let reach: number | undefined;
    let shares: number | undefined;
    let saves: number | undefined;

    try {
      const insightParams = new URLSearchParams({
        metric: 'impressions,reach,saved,shares',
        access_token: accessToken,
      });
      const insights = await this.getJson<{
        data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
      }>(`${this.graphBase}/${mediaId}/insights?${insightParams}`);

      for (const row of insights.data ?? []) {
        const value = row.values?.[0]?.value ?? 0;
        if (row.name === 'impressions') impressions = value;
        if (row.name === 'reach') reach = value;
        if (row.name === 'shares') shares = value;
        if (row.name === 'saved') saves = value;
      }
    } catch {
      /* insights pueden requerir permisos extra; usamos like_count/comments_count */
    }

    return {
      impressions,
      reach,
      likes,
      comments,
      shares,
      saves,
      engagement: likes + comments + (shares ?? 0),
    };
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} no está definida`);
    return value;
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const body = (await response.json()) as T & { error?: { message: string } };
    if (!response.ok || body.error) {
      this.logger.error('Error en Graph API (sin exponer tokens)');
      throw new Error(body.error?.message ?? `Graph API error ${response.status}`);
    }
    return body;
  }

  private async postJson<T>(url: string, params: URLSearchParams): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const body = (await response.json()) as T & { error?: { message: string } };
    if (!response.ok || body.error) {
      this.logger.error('Error en Graph API publish (sin exponer tokens)');
      throw new Error(body.error?.message ?? `Graph API error ${response.status}`);
    }
    return body;
  }
}
