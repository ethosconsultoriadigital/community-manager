import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoProvider,
} from '../interfaces/video-provider.interface';

/** MP4 público corto para desarrollo sin FAL_KEY. */
const MOCK_REEL_URL =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

@Injectable()
export class MockVideoProvider implements VideoProvider {
  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
    createHash('sha256').update(input.prompt).digest('hex');
    return {
      url: MOCK_REEL_URL,
      width: 720,
      height: 1280,
      durationSeconds: 15,
      model: 'mock-video',
      provider: 'mock',
    };
  }
}
