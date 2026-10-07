import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClientsRepository } from '@cm/db';
import sharp from 'sharp';
import { MediaStorageService } from '../../media/media-storage.service';
import {
  DEFAULT_LAYOUT_KEY,
  logoPosition,
  parseClientBrand,
  resolveLayout,
  type BrandTextField,
} from './brand-layout';

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

    const backgroundBuffer = await this.resolveImageBuffer(input.background);
    const logoSource = await this.resolveImageBuffer(logoUrl);

    const { width: canvasW, height: canvasH } = layout.canvas;

    const resizedLogo = await sharp(logoSource)
      .resize(layout.logo.maxWidth, layout.logo.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });

    const logoMeta = resizedLogo.info;
    const logoW = logoMeta.width ?? 0;
    const logoH = logoMeta.height ?? 0;
    const { left, top } = logoPosition({
      canvasW,
      canvasH,
      logoW,
      logoH,
      anchor: layout.logo.anchor,
      margin: layout.logo.margin,
    });

    const svgText = this.buildTextSvg(layout.canvas, layout.text, input.fields);
    const composites: sharp.OverlayOptions[] = [
      { input: resizedLogo.data, top, left },
    ];
    if (svgText) {
      composites.push({ input: Buffer.from(svgText), top: 0, left: 0 });
    }

    const buffer = await sharp(backgroundBuffer)
      .resize(canvasW, canvasH, { fit: 'cover' })
      .composite(composites)
      .png()
      .toBuffer();

    this.logger.debug(
      `Composed brand layout=${layoutKey} canvas=${canvasW}x${canvasH} logo=${logoW}x${logoH}`,
    );

    return { buffer, width: canvasW, height: canvasH };
  }

  private async resolveImageBuffer(source: Buffer | string): Promise<Buffer> {
    if (Buffer.isBuffer(source)) return source;
    const { buffer } = await this.mediaStorage.readBytesFromUrl(source);
    return buffer;
  }

  private buildTextSvg(
    canvas: { width: number; height: number },
    textFields: BrandTextField[],
    fields: Record<string, string>,
  ): string | null {
    const nodes: string[] = [];
    for (const spec of textFields) {
      const value = fields[spec.field]?.trim();
      if (!value) continue;
      const lines = wrapText(value, spec.maxWidth, spec.size);
      const lineHeight = Math.round(spec.size * 1.2);
      const anchor =
        spec.align === 'center' ? 'middle' : spec.align === 'right' ? 'end' : 'start';
      const x =
        spec.align === 'center'
          ? spec.x + Math.round(spec.maxWidth / 2)
          : spec.align === 'right'
            ? spec.x + spec.maxWidth
            : spec.x;
      const weight = spec.font === 'bold' ? '700' : '600';
      lines.forEach((line, i) => {
        const y = spec.y + i * lineHeight;
        nodes.push(
          `<text x="${x}" y="${y}" fill="${escapeXml(spec.color)}" font-size="${spec.size}" ` +
            `font-family="Arial, Helvetica, sans-serif" font-weight="${weight}" ` +
            `text-anchor="${anchor}">${escapeXml(line)}</text>`,
        );
      });
    }
    if (!nodes.length) return null;
    return (
      `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">` +
      nodes.join('') +
      `</svg>`
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Aproxima wrapping por ancho de glifo (~0.55em). */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const avgChar = Math.max(fontSize * 0.55, 1);
  const maxChars = Math.max(1, Math.floor(maxWidth / avgChar));
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}
