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
  /** false si se usa el ID pegado sin poder leer su dirección en Meta. */
  verified?: boolean;
};

/** Aviso cuando Meta no deja buscar lugares (falta Page Public Content Access). */
export const PLACE_SEARCH_NOT_ALLOWED_MESSAGE =
  'Meta todavía no deja buscar lugares con esta app (falta el permiso «Page Public Content Access»). ' +
  'Mientras tanto usa «Ubicación de mi página» o pega el enlace o el ID de la página de Facebook del lugar.';

type PageRef = { kind: 'id' | 'username'; value: string };

const RESERVED_FB_PATHS = new Set([
  'groups',
  'events',
  'watch',
  'share',
  'sharer',
  'sharer.php',
  'photo',
  'photo.php',
  'story.php',
  'permalink.php',
  'reel',
  'marketplace',
  'hashtag',
  'login',
  'home.php',
]);

/**
 * Saca el ID o el nombre de usuario de una Page a partir de lo que pegan:
 * 123456789, @usuario, usuario, facebook.com/usuario, facebook.com/profile.php?id=…,
 * facebook.com/pages/Nombre/123…, facebook.com/Nombre-123….
 */
export function parseFacebookPageRef(raw: string): PageRef | null {
  const input = raw.trim();
  if (!input) return null;
  if (/^\d{5,25}$/.test(input)) return { kind: 'id', value: input };

  const looksLikeUrl = /facebook\.com|fb\.com|fb\.me|^https?:\/\//i.test(input);
  if (!looksLikeUrl) {
    const handle = input.replace(/^@/, '');
    return /^[A-Za-z0-9.\-_]{3,80}$/.test(handle) ? { kind: 'username', value: handle } : null;
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (!/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(url.hostname)) return null;

  const idParam = url.searchParams.get('id');
  if (idParam && /^\d{5,25}$/.test(idParam)) return { kind: 'id', value: idParam };

  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return null;
  const first = segments[0]!.toLowerCase();
  if (first === 'pages' || first === 'people' || first === 'pg') {
    const numeric = [...segments].reverse().find((s) => /^\d{5,25}$/.test(s));
    if (numeric) return { kind: 'id', value: numeric };
    if (first === 'pg' && segments[1]) return { kind: 'username', value: segments[1] };
    return null;
  }
  if (RESERVED_FB_PATHS.has(first) || first === 'profile.php') return null;
  const head = segments[0]!;
  const trailingId = /-(\d{5,25})$/.exec(head);
  if (trailingId) return { kind: 'id', value: trailingId[1]! };
  if (/^\d{5,25}$/.test(head)) return { kind: 'id', value: head };
  return /^[A-Za-z0-9.\-_]{3,80}$/.test(head) ? { kind: 'username', value: head } : null;
}

export function isPermissionError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes('pages_read_engagement') ||
    lower.includes('public page') ||
    lower.includes('page public') ||
    lower.includes('(#10)') ||
    lower.includes('(#200)') ||
    lower.includes('permission') ||
    lower.includes('feature') ||
    lower.includes('oauth')
  );
}

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

    const { pageToken } = (await this.clientPageTokens(agencyId, clientId))[0]!;
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

    throw new BadRequestException(this.friendlySearchError(lastError));
  }

  /**
   * La Page de Facebook del propio cliente como ubicación. Se lee con el token
   * de la Page: no necesita Page Public Content Access.
   */
  async ownPagePlaces(
    agencyId: string,
    clientId: string,
  ): Promise<{ places: PlaceSearchResult[]; message?: string }> {
    const pages = await this.clientPageTokens(agencyId, clientId);
    const places: PlaceSearchResult[] = [];
    const withoutAddress: string[] = [];
    let lastError: string | null = null;
    for (const page of pages) {
      try {
        const info = await this.meta.getPagePlace(page.pageToken, page.pageId);
        if (info.hasLocation) {
          places.push({
            id: info.id,
            name: info.name,
            locationLabel: info.locationLabel,
            taggableOnInstagram: info.taggableOnInstagram,
            verified: true,
          });
        } else {
          withoutAddress.push(info.name);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Error de Meta';
        this.logger.warn(`No se pudo leer la ubicación de la Page ${page.pageId}: ${lastError}`);
      }
    }
    if (places.length) return { places };
    if (withoutAddress.length) {
      return {
        places: [],
        message:
          `La página de Facebook «${withoutAddress[0]}» no tiene dirección. ` +
          'Agrégala en Facebook (Configuración de la página → Ubicación) o pega el enlace de otra página que sí la tenga.',
      };
    }
    throw new BadRequestException(
      `No se pudo leer la ubicación de la página del cliente: ${lastError ?? 'sin detalle'}`,
    );
  }

  /**
   * Resuelve un enlace o ID de Page pegado por el usuario. Primero con el token
   * de la Page del cliente y luego con el de la app. Si Meta no deja leerla pero
   * es un ID numérico, se devuelve sin verificar (al publicar, si Meta la
   * rechaza, el post sale sin ubicación).
   */
  async resolvePlace(
    agencyId: string,
    clientId: string,
    input: string,
  ): Promise<PlaceSearchResult> {
    const ref = parseFacebookPageRef(input);
    if (!ref) {
      throw new BadRequestException(
        'No reconozco ese enlace. Pega el enlace de la página de Facebook del lugar ' +
          '(facebook.com/…) o su ID numérico.',
      );
    }

    const pages = await this.clientPageTokens(agencyId, clientId);
    const own = pages.find((p) => p.pageId === ref.value);
    const tokensToTry = [
      ...(own ? [own.pageToken] : []),
      ...pages.map((p) => p.pageToken),
      this.getAppAccessToken(),
    ].filter((t, i, arr): t is string => Boolean(t) && arr.indexOf(t) === i);

    let lastError = 'Meta no devolvió la página';
    for (const token of tokensToTry) {
      try {
        const info = await this.meta.getPagePlace(token, ref.value);
        if (!info.hasLocation) {
          throw new BadRequestException(
            `La página «${info.name}» no tiene dirección en Facebook, así que no sirve como ubicación.`,
          );
        }
        return {
          id: info.id,
          name: info.name,
          locationLabel: info.locationLabel,
          taggableOnInstagram: info.taggableOnInstagram,
          verified: true,
        };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        lastError = err instanceof Error ? err.message : lastError;
        this.logger.warn(`No se pudo resolver la Page ${ref.value}: ${lastError}`);
      }
    }

    if (ref.kind === 'id') {
      return {
        id: ref.value,
        name: `Página de Facebook ${ref.value}`,
        taggableOnInstagram: false,
        verified: false,
      };
    }
    if (isPermissionError(lastError)) {
      throw new BadRequestException(
        'Meta no deja leer esa página con los permisos actuales. Pega su ID numérico ' +
          '(en Facebook: la página → Información → Transparencia de la página → ID de la página).',
      );
    }
    throw new BadRequestException(`No se encontró esa página en Facebook: ${lastError}`);
  }

  /** Pages de Facebook activas del cliente con su token descifrado. */
  private async clientPageTokens(
    agencyId: string,
    clientId: string,
  ): Promise<Array<{ pageId: string; pageToken: string }>> {
    const accounts = await this.socialAccounts.findByAgency(agencyId, clientId);
    const fbAccounts = accounts.filter((a) => a.platform === 'facebook' && a.is_active);
    if (!fbAccounts.length) {
      throw new BadRequestException(
        'Conecta una cuenta Facebook activa del cliente para buscar ubicaciones',
      );
    }
    const key = this.requireEncryptionKey();
    const out: Array<{ pageId: string; pageToken: string }> = [];
    for (const fb of fbAccounts) {
      const withToken = await this.socialAccounts.findByIdWithToken(agencyId, fb.id);
      if (!withToken?.access_token_enc) continue;
      try {
        out.push({
          pageId: fb.external_account_id,
          pageToken: decryptToken(withToken.access_token_enc, key),
        });
      } catch {
        this.logger.warn(`No se pudo descifrar el token de la Page ${fb.external_account_id}`);
      }
    }
    if (!out.length) {
      throw new BadRequestException(
        'No se pudo leer el token de Facebook. Vuelve a conectar Meta en Cuentas.',
      );
    }
    return out;
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
    if (isPermissionError(raw)) {
      return `${PLACE_SEARCH_NOT_ALLOWED_MESSAGE} Detalle de Meta: ${raw}`;
    }
    if (lower.includes('deprecated') || lower.includes('type=place')) {
      return `La búsqueda de lugares de Meta falló: ${raw}`;
    }
    return `No se pudieron buscar ubicaciones: ${raw}`;
  }
}
