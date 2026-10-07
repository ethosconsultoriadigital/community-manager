import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FalLipSyncProvider } from './fal-lipsync.provider';
import type {
  LipSyncInput,
  LipSyncProvider,
  LipSyncResult,
} from './interfaces/lipsync-provider.interface';
import { MockLipSyncProvider } from './mocks/mock-lipsync.provider';

/**
 * fal LivePortrait (u otro FAL_LIPSYNC_MODEL) si hay FAL_KEY; si no, mock.
 * Marcado experimental: el producto no depende de un modelo concreto.
 */
@Injectable()
export class HybridLipSyncProvider implements LipSyncProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly fal: FalLipSyncProvider,
    private readonly mock: MockLipSyncProvider,
  ) {}

  animate(input: LipSyncInput): Promise<LipSyncResult> {
    if (this.config.get<string>('FAL_KEY')?.trim()) {
      return this.fal.animate(input);
    }
    return this.mock.animate(input);
  }
}
