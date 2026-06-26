import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CANVA_API_BASE,
  type BrandTemplateField,
  type CanvaAssetUploadJob,
  type CanvaAutofillJob,
  type CanvaDesign,
  type CanvaDesignList,
  type CanvaExportJob,
  type CanvaTokenResponse,
} from './canva.types';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class CanvaConnectClient {
  constructor(private readonly config: ConfigService) {}

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<CanvaTokenResponse> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<CanvaTokenResponse> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async createSocialDesign(
    accessToken: string,
    title: string,
  ): Promise<CanvaDesign> {
    const response = await fetch(`${CANVA_API_BASE}/designs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_type: {
          type: 'custom',
          width: 1080,
          height: 1080,
        },
        title: title.slice(0, 255),
      }),
    });

    const body = (await this.readJson(response)) as { design?: CanvaDesign };
    if (!response.ok || !body.design?.id) {
      throw new Error(this.formatApiError('crear diseño', response.status, body));
    }
    return body.design;
  }

  async listDesigns(
    accessToken: string,
    limit = 10,
  ): Promise<CanvaDesignList> {
    const params = new URLSearchParams({ limit: String(limit) });
    const response = await fetch(`${CANVA_API_BASE}/designs?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await this.readJson(response)) as CanvaDesignList;
    if (!response.ok) {
      throw new Error(this.formatApiError('listar diseños', response.status, body));
    }
    return body;
  }

  buildEditUrl(editUrl: string, correlationState: string): string {
    const url = new URL(editUrl);
    url.searchParams.set('correlation_state', correlationState.slice(0, 50));
    return url.toString();
  }

  async uploadAsset(
    accessToken: string,
    buffer: Buffer,
    name: string,
  ): Promise<CanvaAssetUploadJob> {
    const metadata = JSON.stringify({
      name_base64: Buffer.from(name.slice(0, 50), 'utf8').toString('base64'),
    });

    const response = await fetch(`${CANVA_API_BASE}/asset-uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': metadata,
      },
      body: buffer,
    });

    const body = (await this.readJson(response)) as { job?: CanvaAssetUploadJob };
    if (!response.ok) {
      throw new Error(this.formatApiError('subir asset a Canva', response.status, body));
    }

    const job = body.job;
    if (!job?.id) throw new Error('Canva no devolvió un job de subida de asset');
    return this.pollAssetUpload(accessToken, job);
  }

  async getBrandTemplateDataset(
    accessToken: string,
    brandTemplateId: string,
  ): Promise<Record<string, BrandTemplateField>> {
    const response = await fetch(
      `${CANVA_API_BASE}/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const body = (await this.readJson(response)) as { dataset?: Record<string, BrandTemplateField> };
    if (!response.ok) {
      throw new Error(this.formatApiError('obtener dataset de plantilla', response.status, body));
    }
    return body.dataset ?? {};
  }

  async createAutofillJob(
    accessToken: string,
    brandTemplateId: string,
    data: Record<string, unknown>,
  ): Promise<CanvaAutofillJob> {
    const response = await fetch(`${CANVA_API_BASE}/autofills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_template_id: brandTemplateId,
        data,
      }),
    });

    const body = (await this.readJson(response)) as { job?: CanvaAutofillJob };
    if (!response.ok) {
      throw new Error(this.formatApiError('crear autofill', response.status, body));
    }

    const job = body.job;
    if (!job?.id) throw new Error('Canva no devolvió un job de autofill');
    return this.pollAutofill(accessToken, job);
  }

  async exportDesignPng(accessToken: string, designId: string): Promise<string> {
    const response = await fetch(`${CANVA_API_BASE}/exports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_id: designId,
        format: { type: 'png' },
      }),
    });

    const body = (await this.readJson(response)) as { job?: CanvaExportJob };
    if (!response.ok) {
      throw new Error(this.formatApiError('exportar diseño', response.status, body));
    }

    const job = body.job;
    if (!job?.id) throw new Error('Canva no devolvió un job de exportación');
    const completed = await this.pollExport(accessToken, job);
    const url = completed.urls?.[0];
    if (!url) throw new Error('Canva no devolvió URL de descarga del PNG');
    return url;
  }

  async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo exportado (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async pollAssetUpload(
    accessToken: string,
    initial: CanvaAssetUploadJob,
  ): Promise<CanvaAssetUploadJob> {
    return this.pollJob(initial, async (jobId) => {
      const response = await fetch(`${CANVA_API_BASE}/asset-uploads/${jobId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await this.readJson(response)) as { job?: CanvaAssetUploadJob };
      if (!response.ok) {
        throw new Error(this.formatApiError('consultar subida de asset', response.status, body));
      }
      if (!body.job) throw new Error('Respuesta de Canva sin job de asset');
      return body.job;
    });
  }

  private async pollAutofill(
    accessToken: string,
    initial: CanvaAutofillJob,
  ): Promise<CanvaAutofillJob> {
    return this.pollJob(initial, async (jobId) => {
      const response = await fetch(`${CANVA_API_BASE}/autofills/${jobId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await this.readJson(response)) as { job?: CanvaAutofillJob };
      if (!response.ok) {
        throw new Error(this.formatApiError('consultar autofill', response.status, body));
      }
      if (!body.job) throw new Error('Respuesta de Canva sin job de autofill');
      return body.job;
    });
  }

  private async pollExport(
    accessToken: string,
    initial: CanvaExportJob,
  ): Promise<CanvaExportJob> {
    return this.pollJob(initial, async (jobId) => {
      const response = await fetch(`${CANVA_API_BASE}/exports/${jobId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await this.readJson(response)) as { job?: CanvaExportJob };
      if (!response.ok) {
        throw new Error(this.formatApiError('consultar exportación', response.status, body));
      }
      if (!body.job) throw new Error('Respuesta de Canva sin job de exportación');
      return body.job;
    });
  }

  private async pollJob<T extends { id: string; status: string; error?: { message?: string } }>(
    initial: T,
    fetchJob: (jobId: string) => Promise<T>,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<T> {
    let current = initial;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (current.status === 'success') return current;
      if (current.status === 'failed') {
        throw new Error(current.error?.message ?? 'Job de Canva falló');
      }
      await this.sleep(delayMs);
      current = await fetchJob(current.id);
    }
    throw new Error('Tiempo de espera agotado esperando respuesta de Canva');
  }

  private async requestToken(body: Record<string, string>): Promise<CanvaTokenResponse> {
    const clientId = this.config.get<string>('CANVA_CLIENT_ID');
    const clientSecret = this.config.get<string>('CANVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('CANVA_CLIENT_ID y CANVA_CLIENT_SECRET no están definidas');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${CANVA_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });

    const json = (await this.readJson(response)) as CanvaTokenResponse & { error?: string };
    if (!response.ok) {
      throw new Error(
        json.error ?? `Error al obtener token de Canva (${response.status})`,
      );
    }
    if (!json.access_token) throw new Error('Canva no devolvió access_token');
    return json;
  }

  private async readJson(response: Response): Promise<JsonRecord> {
    try {
      return (await response.json()) as JsonRecord;
    } catch {
      return {};
    }
  }

  private formatApiError(action: string, status: number, body: JsonRecord): string {
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${status}`;
    return `No se pudo ${action}: ${message}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
