import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiMocksAllowed } from './ai-mocks';
import { FalLipSyncProvider } from './fal-lipsync.provider';
import type {
  LipSyncInput,
  LipSyncProvider,
  LipSyncResult,
} from './interfaces/lipsync-provider.interface';
import { MockLipSyncProvider } from './mocks/mock-lipsync.provider';

/**
 * fal Sync-3 / SadTalker (FAL_LIPSYNC_MODEL) si hay FAL_KEY; si no, mock.
 * Default: sync-lipsync v3 (ilustraciones / cartoon).
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
    if (!aiMocksAllowed(this.config)) {
      throw new BadRequestException(
        'Falta FAL_KEY en el servidor. Sin esa clave no se puede animar el avatar (en producción no se sustituye por un video de prueba).',
      );
    }
    return this.mock.animate(input);
  }
}
