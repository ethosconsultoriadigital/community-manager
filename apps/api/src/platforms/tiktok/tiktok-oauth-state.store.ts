import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { TikTokOAuthPendingState } from './tiktok.types';

const KEY_PREFIX = 'oauth:tiktok:';
const TTL_SECONDS = 600;

@Injectable()
export class TikTokOAuthStateStore implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  async save(state: string, payload: TikTokOAuthPendingState): Promise<void> {
    const key = `${KEY_PREFIX}${state}`;
    await this.getClient().set(key, JSON.stringify(payload), 'EX', TTL_SECONDS);
  }

  async consume(state: string): Promise<TikTokOAuthPendingState | null> {
    const key = `${KEY_PREFIX}${state}`;
    const raw = await this.getClient().getdel(key);
    if (!raw) return null;
    return JSON.parse(raw) as TikTokOAuthPendingState;
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
  }

  private getClient(): Redis {
    if (!this.client) {
      const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
      this.client = new Redis(url, { maxRetriesPerRequest: 2 });
    }
    return this.client;
  }
}
