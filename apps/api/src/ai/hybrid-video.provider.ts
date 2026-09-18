import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoProvider,
} from './interfaces/video-provider.interface';
import { FalVideoProvider } from './fal-video.provider';
import { MockVideoProvider } from './mocks/mock-video.provider';

/**
 * Usa fal.ai si hay FAL_KEY; si no, mock (MP4 de muestra) para desarrollo local.
 */
@Injectable()
export class HybridVideoProvider implements VideoProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly fal: FalVideoProvider,
    private readonly mock: MockVideoProvider,
  ) {}

  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
    if (this.hasFalKey()) {
      return this.fal.generateVideo(input);
    }
    return this.mock.generateVideo(input);
  }

  private hasFalKey(): boolean {
    return Boolean(this.config.get<string>('FAL_KEY')?.trim());
  }
}
