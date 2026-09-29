import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { XOAuthPendingState } from './x.types';

const KEY_PREFIX = 'oauth:x:';
const TTL_SECONDS = 600;

@Injectable()
export class XOAuthStateStore implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  async save(state: string, payload: XOAuthPendingState): Promise<void> {
    const key = `${KEY_PREFIX}${state}`;
    await this.getClient().set(key, JSON.stringify(payload), 'EX', TTL_SECONDS);
  }

  /** Lee y elimina en un solo paso (state de un solo uso). */
  async consume(state: string): Promise<XOAuthPendingState | null> {
    const key = `${KEY_PREFIX}${state}`;
    const raw = await this.getClient().getdel(key);
    if (!raw) return null;
    return JSON.parse(raw) as XOAuthPendingState;
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
