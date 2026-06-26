import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import type { CanvaReturnJwtPayload } from './canva.types';

const CANVA_JWKS_URL = 'https://api.canva.com/rest/v1/connect/keys';

@Injectable()
export class CanvaReturnJwtService {
  private jwks: jose.JWTVerifyGetKey | null = null;

  constructor(private readonly config: ConfigService) {}

  async verifyCorrelationJwt(token: string): Promise<CanvaReturnJwtPayload> {
    const clientId = this.config.get<string>('CANVA_CLIENT_ID');
    if (!clientId) throw new Error('CANVA_CLIENT_ID no está definida');

    if (!this.jwks) {
      this.jwks = jose.createRemoteJWKSet(new URL(CANVA_JWKS_URL));
    }

    const { payload } = await jose.jwtVerify(token, this.jwks, {
      audience: clientId,
    });

    if (payload.type !== 'rti') {
      throw new Error('JWT de retorno Canva inválido');
    }

    const designId = payload.design_id;
    if (typeof designId !== 'string') {
      throw new Error('JWT de retorno Canva sin design_id');
    }

    return {
      aud: String(payload.aud),
      exp: Number(payload.exp),
      sub: String(payload.sub),
      team_id: typeof payload.team_id === 'string' ? payload.team_id : undefined,
      type: String(payload.type),
      design_id: designId,
      correlation_state:
        typeof payload.correlation_state === 'string'
          ? payload.correlation_state
          : undefined,
    };
  }
}
