import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClientsRepository } from '@cm/db';
import { MediaStorageService } from '../../media/media-storage.service';
import { DEFAULT_LAYOUT_KEY, parseClientBrand, resolveLayout } from './brand-layout';
import { composeBrandImage } from './compose-brand';

export type ComposeInput = {
  background: Buffer | string;
  agencyId: string;
  clientId: string;
  layoutKey?: string;
  fields: Record<string, string>;
  /** Override del logo del cliente (URL o storage); nunca va a OpenAI. */
  logoUrl?: string;
};

export type ComposeResult = {
  buffer: Buffer;
  width: number;
  height: number;
};

export { wrapText } from './compose-brand';

@Injectable()
export class CompositionService {
  private readonly logger = new Logger(CompositionService.name);

  constructor(
    private readonly clients: ClientsRepository,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async compose(input: ComposeInput): Promise<ComposeResult> {
    if (!input.agencyId?.trim()) {
      throw new BadRequestException('agencyId es obligatorio para componer');
    }
    if (!input.clientId?.trim()) {
      throw new BadRequestException('clientId es obligatorio para componer');
    }

    const client = await this.clients.findById(input.agencyId, input.clientId);
    if (!client) {
      throw new BadRequestException('Cliente no encontrado para composición');
    }

    const brand = parseClientBrand(client.brand);
    const layoutKey = input.layoutKey?.trim() || DEFAULT_LAYOUT_KEY;
    const layout = resolveLayout(brand, layoutKey);
    const logoUrl = input.logoUrl?.trim() || brand.logoUrl;
    if (!logoUrl) {
      throw new BadRequestException(
        'No hay logo de marca para componer. Adjunta un logo primero.',
      );
    }

    const [background, logo] = await Promise.all([
      this.resolveImageBuffer(input.background),
      this.resolveImageBuffer(logoUrl),
    ]);
    const composed = await composeBrandImage({
      background,
      logo,
      layout,
      fields: input.fields,
    });

    this.logger.debug(
      `Composed brand layout=${layoutKey} canvas=${composed.width}x${composed.height} ` +
        `logo=${composed.logoWidth}x${composed.logoHeight} at=${composed.logoLeft},${composed.logoTop} ` +
        `placement=${composed.placement}`,
    );

    return { buffer: composed.buffer, width: composed.width, height: composed.height };
  }

  private async resolveImageBuffer(source: Buffer | string): Promise<Buffer> {
    if (Buffer.isBuffer(source)) return source;
    const { buffer } = await this.mediaStorage.readBytesFromUrl(source);
    return buffer;
  }
}
