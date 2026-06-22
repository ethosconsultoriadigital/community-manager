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
