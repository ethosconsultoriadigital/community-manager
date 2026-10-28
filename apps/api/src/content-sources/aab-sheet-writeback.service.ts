import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentSourcesRepository, SourceItemsRepository } from '@cm/db';
import {
  formatSheetDateTime,
  isAabConfig,
  quoteSheetTitle,
  resolveAabSheetStatus,
  type AabSheetStatus,
} from './aab-columns';
import { planAabCellUpdates } from './aab-sheet-plan';
import {
  batchUpdateSheetValues,
  fetchSpreadsheetValues,
  getGoogleAccessToken,
  parseServiceAccountJson,
  resolveSheetTitle,
} from './google-sheets-auth';

type SheetSource = NonNullable<Awaited<ReturnType<ContentSourcesRepository['findById']>>>;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Escribe estado_redes y fecha_redes en hojas AAB.
 * Un fallo se registra y se reintenta en el siguiente sync; no tumba la publicación.
 */
@Injectable()
export class AabSheetWriteBackService {
  private readonly logger = new Logger(AabSheetWriteBackService.name);

  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly contentSources: ContentSourcesRepository,
    private readonly config: ConfigService,
  ) {}

  /** true si el post viene de una fuente con mapa 'aab'. Ante error responde false. */
  async isAabPost(agencyId: string, postId: string): Promise<boolean> {
    try {
      const item = await this.sourceItems.findByLinkedPost(agencyId, postId);
      return Boolean(item && isAabConfig(item.content_sources?.config));
    } catch (err) {
      this.logger.warn(`No se pudo saber si ${postId} es AAB: ${errMsg(err)}`);
      return false;
    }
  }

  async notifyFromPost(agencyId: string, postId: string): Promise<void> {
    try {
      const item = await this.sourceItems.findByLinkedPost(agencyId, postId);
      if (!item || !isAabConfig(item.content_sources?.config)) return;
      await this.writeItems(agencyId, item.content_sources, [item]);
    } catch (err) {
      this.logger.warn(`Write-back AAB (post ${postId}): ${errMsg(err)}`);
    }
  }

  async retrySource(agencyId: string, sourceId: string): Promise<void> {
    try {
      const source = await this.contentSources.findById(agencyId, sourceId);
      if (!source || !isAabConfig(source.config)) return;
      const items = await this.sourceItems.findLinkedForSource(agencyId, sourceId);
      if (!items.length) return;
      await this.writeItems(agencyId, source, items);
    } catch (err) {
      this.logger.warn(`Write-back AAB (fuente ${sourceId}): ${errMsg(err)}`);
    }
  }

  private async writeItems(
    agencyId: string,
    source: SheetSource,
    items: Array<{ id: string; external_id: string; sheet_status_written: string | null }>,
  ): Promise<void> {
    const pending: Array<{ id: string; external_id: string; status: AabSheetStatus }> = [];
    for (const item of items) {
      const posts = await this.sourceItems.listAabPostViews(agencyId, item.id);
      const status = resolveAabSheetStatus(posts);
      if (!status || item.sheet_status_written === status) continue;
      pending.push({ id: item.id, external_id: item.external_id, status });
    }
    if (!pending.length) return;

    const config =
      source.config && typeof source.config === 'object' && !Array.isArray(source.config)
        ? (source.config as Record<string, unknown>)
        : {};
    const spreadsheetId = String(config.spreadsheetId ?? '').trim();
    if (!spreadsheetId) {
      this.logger.warn(`Fuente AAB ${source.id} sin spreadsheetId; no se escribe el sheet`);
      return;
    }

    const saRaw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!saRaw) {
      this.logger.warn('Falta GOOGLE_SERVICE_ACCOUNT_JSON; el estado AAB se reintenta luego');
      return;
    }

    const token = await getGoogleAccessToken(parseServiceAccountJson(saRaw));
    const sheetTitle = await resolveSheetTitle(token, spreadsheetId, config);
    const table = await fetchSpreadsheetValues(
      token,
      spreadsheetId,
      `${quoteSheetTitle(sheetTitle)}!A:ZZ`,
    );
    const fecha = formatSheetDateTime(new Date());

    for (const item of pending) {
      try {
        const data = planAabCellUpdates(table, item.external_id, item.status, fecha, sheetTitle);
        if (!data) {
          this.logger.warn(
            `No se encontró la fila ${item.external_id} (o faltan estado_redes/fecha_redes) para escribir ${item.status}`,
          );
          await this.sourceItems.recordSheetWrite(agencyId, item.id, item.status, false);
          continue;
        }
        await batchUpdateSheetValues(token, spreadsheetId, data);
        await this.sourceItems.recordSheetWrite(agencyId, item.id, item.status, true);
      } catch (err) {
        this.logger.warn(
          `No se pudo escribir estado_redes de ${item.external_id}: ${errMsg(err)}`,
        );
        try {
          await this.sourceItems.recordSheetWrite(agencyId, item.id, item.status, false);
        } catch (dbErr) {
          this.logger.warn(
            `No se pudo guardar el reintento de ${item.external_id}: ${errMsg(dbErr)}`,
          );
        }
      }
    }
  }
}
