import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAccountsRepository } from '@cm/db';
import { decryptToken } from '@cm/shared';
import { MetaGraphClient } from './meta-graph.client';

export type PlaceSearchResult = {
  id: string;
  name: string;
  locationLabel?: string;
  /** true si tiene lat/lng — requerido para etiquetar en Instagram */
  taggableOnInstagram: boolean;
};

@Injectable()
export class MetaPlacesService {
  private readonly logger = new Logger(MetaPlacesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly meta: MetaGraphClient,
    private readonly socialAccounts: SocialAccountsRepository,
  ) {}

  async searchForClient(
    agencyId: string,
    clientId: string,
    query: string,
  ): Promise<PlaceSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const accounts = await this.socialAccounts.findByAgency(agencyId, clientId);
    const fb = accounts.find((a) => a.platform === 'facebook' && a.is_active);
    if (!fb) {
      throw new BadRequestException(
        'Conecta una cuenta Facebook activa del cliente para buscar ubicaciones',
      );
    }

    const withToken = await this.socialAccounts.findByIdWithToken(agencyId, fb.id);
    if (!withToken?.access_token_enc) {
      throw new BadRequestException('No hay token de Facebook disponible');
    }

    const key = this.requireEncryptionKey();
    let pageToken: string;
    try {
      pageToken = decryptToken(withToken.access_token_enc, key);
    } catch {
      throw new BadRequestException(
        'No se pudo leer el token de Facebook. Vuelve a conectar Meta en Cuentas.',
      );
    }

    const tokensToTry = [this.getAppAccessToken(), pageToken].filter(
      (t, i, arr): t is string => Boolean(t) && arr.indexOf(t) === i,
    );

    let lastError = 'No se pudo buscar ubicaciones en Meta';
    for (const token of tokensToTry) {
      try {
        return await this.meta.searchPlaces(token, q);
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
        this.logger.warn(`Búsqueda de lugares falló: ${lastError}`);
      }
    }

    throw new BadRequestException(
      this.friendlySearchError(lastError),
    );
  }

  private getAppAccessToken(): string | null {
    const appId = this.config.get<string>('META_APP_ID')?.trim();
    const appSecret = this.config.get<string>('META_APP_SECRET')?.trim();
    if (!appId || !appSecret) return null;
    return `${appId}|${appSecret}`;
  }

  private requireEncryptionKey(): string {
    const key = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new BadRequestException('TOKEN_ENCRYPTION_KEY no está definida');
    return key;
  }

  private friendlySearchError(raw: string): string {
    const lower = raw.toLowerCase();
    if (
      lower.includes('pages_read_engagement') ||
      lower.includes('public page') ||
      lower.includes('page public') ||
      lower.includes('(#10)') ||
      lower.includes('permission') ||
      lower.includes('oauth')
    ) {
      return (
        'Meta no autorizó la búsqueda de lugares. En la app de Meta Developers ' +
        'activa «Page Public Content Access» / Pages Search, o vuelve a conectar Meta. ' +
        `Detalle: ${raw}`
      );
    }
    if (lower.includes('deprecated') || lower.includes('type=place')) {
      return `La búsqueda de lugares de Meta falló: ${raw}`;
    }
    return `No se pudieron buscar ubicaciones: ${raw}`;
  }
}
