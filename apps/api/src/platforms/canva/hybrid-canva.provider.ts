import { Injectable } from '@nestjs/common';
import type {
  CanvaProvider,
  ComposeFlyerInput,
  ComposeFlyerResult,
} from '../../ai/interfaces/canva-provider.interface';
import { MockCanvaProvider } from '../../ai/mocks/mock-providers';
import { CanvaTokenService } from './canva-token.service';
import { RealCanvaProvider } from './real-canva.provider';

@Injectable()
export class HybridCanvaProvider implements CanvaProvider {
  constructor(
    private readonly tokens: CanvaTokenService,
    private readonly real: RealCanvaProvider,
    private readonly mock: MockCanvaProvider,
  ) {}

  async composeFlyer(input: ComposeFlyerInput): Promise<ComposeFlyerResult> {
    const canUseReal = await this.tokens.hasCanvaAccess(input.agencyId);
    if (canUseReal) {
      return this.real.composeFlyer(input);
    }
    return this.mock.composeFlyer(input);
  }
}
