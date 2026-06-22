import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsRepository } from '@cm/db';
import type {
  CanvaProvider,
  ComposeFlyerInput,
  ComposeFlyerResult,
} from '../../ai/interfaces/canva-provider.interface';
import { MediaStorageService } from '../../media/media-storage.service';
import { CanvaConnectClient } from './canva-connect.client';
import { CanvaTokenService } from './canva-token.service';
import { parseCanvaDesignId, readCanvaBrandConfig } from './canva.types';

@Injectable()
export class RealCanvaProvider implements CanvaProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: CanvaTokenService,
    private readonly canva: CanvaConnectClient,
    private readonly clients: ClientsRepository,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async composeFlyer(input: ComposeFlyerInput): Promise<ComposeFlyerResult> {
    const accessToken = await this.tokens.getAccessToken(input.agencyId);
    if (!accessToken) {
      throw new BadRequestException('Canva no está conectado para esta agencia');
    }

    const client = await this.clients.findById(input.agencyId, input.clientId);
    if (!client) throw new BadRequestException('Cliente no encontrado');

    const brandConfig = readCanvaBrandConfig(client.brand);
    const brandTemplateId =
      input.brandTemplateId ??
      brandConfig.brandTemplateId ??
      this.config.get<string>('CANVA_DEFAULT_BRAND_TEMPLATE_ID');

    if (!brandTemplateId) {
      throw new BadRequestException(
        'Configura brand.canva.brandTemplateId en el cliente o CANVA_DEFAULT_BRAND_TEMPLATE_ID',
      );
    }

    const imageBuffer = await this.downloadSourceImage(input.imageUrl);
    const assetJob = await this.canva.uploadAsset(
      accessToken,
      imageBuffer,
      'cm-source-image.png',
    );
    const assetId = assetJob.asset?.id;
    if (!assetId) throw new Error('Canva no devolvió asset_id tras la subida');

    const dataset = await this.canva.getBrandTemplateDataset(accessToken, brandTemplateId);
    const autofillData = this.buildAutofillData(
      dataset,
      brandConfig,
      input.brief,
      assetId,
    );

    const autofillJob = await this.canva.createAutofillJob(
      accessToken,
      brandTemplateId,
      autofillData,
    );

    const designUrl = autofillJob.result?.design?.url;
    const designId =
      autofillJob.result?.design?.id ??
      (designUrl ? parseCanvaDesignId(designUrl) : null);

    if (!designId) throw new Error('Canva no devolvió design_id tras autofill');

    const exportUrl = await this.canva.exportDesignPng(accessToken, designId);
    const pngBuffer = await this.canva.downloadBinary(exportUrl);

    const stored = await this.mediaStorage.save({
      agencyId: input.agencyId,
      buffer: pngBuffer,
      extension: 'png',
      contentType: 'image/png',
    });

    return {
      url: stored.storageUrl,
      templateId: brandTemplateId,
      provider: 'canva-connect',
      designId,
    };
  }

  private async downloadSourceImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar la imagen fuente (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private buildAutofillData(
    dataset: Record<string, { type: string }>,
    brandConfig: ReturnType<typeof readCanvaBrandConfig>,
    brief: string,
    assetId: string,
  ): Record<string, unknown> {
    const textField =
      brandConfig.textField ??
      Object.keys(dataset).find((key) => dataset[key]?.type === 'text');
    const imageField =
      brandConfig.imageField ??
      Object.keys(dataset).find((key) => dataset[key]?.type === 'image');

    if (!textField && !imageField) {
      throw new BadRequestException(
        'La plantilla de Canva no tiene campos de texto o imagen reconocibles',
      );
    }

    const data: Record<string, unknown> = {};
    if (textField) {
      data[textField] = {
        type: 'text',
        text: brief.trim().slice(0, 500),
      };
    }
    if (imageField) {
      data[imageField] = {
        type: 'image',
        asset_id: assetId,
      };
    }
    return data;
  }
}
