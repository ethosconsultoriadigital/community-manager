import { Injectable } from '@nestjs/common';
import type {
  LipSyncInput,
  LipSyncProvider,
  LipSyncResult,
} from '../interfaces/lipsync-provider.interface';

const MOCK_VIDEO =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

@Injectable()
export class MockLipSyncProvider implements LipSyncProvider {
  async animate(_input: LipSyncInput): Promise<LipSyncResult> {
    return {
      url: MOCK_VIDEO,
      width: 720,
      height: 1280,
      provider: 'mock',
      model: 'mock-lipsync',
    };
  }
}
