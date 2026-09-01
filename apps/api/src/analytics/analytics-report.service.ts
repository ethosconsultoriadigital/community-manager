import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AnalyticsSummary } from '@cm/db';
import { ClientsRepository, GenerationsRepository, PostInsightsRepository } from '@cm/db';
import PDFDocument from 'pdfkit';
import { LLM_PROVIDER } from '../ai/ai.tokens';
import type { LlmProvider } from '../ai/interfaces/llm-provider.interface';
import { MockLlmProvider } from '../ai/mocks/mock-providers';

type PdfDoc = InstanceType<typeof PDFDocument>;

export type ReportPdfOptions = {
  agencyId: string;
  userId: string;
  clientId?: string;
  days: number;
  platform?: string;
};

@Injectable()
export class AnalyticsReportService {
  private readonly logger = new Logger(AnalyticsReportService.name);

  constructor(
    private readonly insights: PostInsightsRepository,
    private readonly clients: ClientsRepository,
    private readonly generations: GenerationsRepository,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async generatePdf(options: ReportPdfOptions): Promise<Buffer> {
    const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
    const platformFilter =
      options.platform && options.platform !== 'all' ? options.platform : undefined;

    const summary = await this.insights.findSummary(
      options.agencyId,
      options.clientId,
      since,
      platformFilter,
    );

    let clientName: string | undefined;
    if (options.clientId) {
      const client = await this.clients.findById(options.agencyId, options.clientId);
      clientName = client?.name ?? undefined;
    }

    const generation = await this.generations.create(options.agencyId, {
      kind: 'copy',
      model: 'report-pdf',
      prompt: `analytics-report:${options.days}d:${platformFilter ?? 'all'}`,
    });

    let narrative;
    try {
      narrative = await this.llm.generateReportNarrative({
        clientName,
        days: options.days,
        platform: platformFilter,
        summaryJson: JSON.stringify(summary),
      });
      await this.generations.updateStatus(options.agencyId, generation.id, 'completed', {
        output: narrative,
        model: 'report-pdf',
      });
    } catch (error) {
      this.logger.warn(`Narrativa IA fallback mock: ${error}`);
      const mock = new MockLlmProvider();
      narrative = await mock.generateReportNarrative({
        clientName,
        days: options.days,
        platform: platformFilter,
        summaryJson: JSON.stringify(summary),
      });
      await this.generations.updateStatus(options.agencyId, generation.id, 'completed', {
        output: { fallback: true, ...narrative },
        model: 'report-pdf-mock',
      });
    }

    return this.renderPdf({
      clientName,
      days: options.days,
      platform: platformFilter,
      summary,
      narrative,
    });
  }

  private renderPdf(input: {
    clientName?: string;
    days: number;
    platform?: string;
    summary: AnalyticsSummary;
    narrative: {
      executiveSummary: string;
      platformHighlights: string;
      recommendations: string;
    };
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const title = input.clientName
        ? `Reporte — ${input.clientName}`
        : 'Reporte de redes sociales';
      doc.fontSize(22).fillColor('#111827').text(title, { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor('#6b7280')
        .text(
          `Últimos ${input.days} días · ${input.platform ?? 'Todas las redes'} · ${new Date().toLocaleDateString('es-MX')}`,
          { align: 'center' },
        );
      doc.moveDown(1.5);

      this.sectionTitle(doc, 'Indicadores clave');
      const t = input.summary.totals;
      doc.fontSize(10).fillColor('#374151');
      doc.text(
        `Engagement: ${t.engagement} · Impresiones: ${t.impressions} · Alcance: ${t.reach} · Me gusta: ${t.likes} · Comentarios: ${t.comments}`,
      );
      doc.text(
        `Publicaciones con métricas: ${input.summary.withMetrics} / ${input.summary.publishedTargets}`,
      );
      doc.moveDown(1);

      this.drawMetricBars(doc, input.summary);
      doc.moveDown(1);

      this.sectionTitle(doc, 'Desglose por red');
      for (const [platform, metrics] of Object.entries(input.summary.byPlatform)) {
        doc
          .fontSize(10)
          .fillColor('#374151')
          .text(
            `${platform}: engagement ${metrics.engagement}, likes ${metrics.likes}, impresiones ${metrics.impressions}`,
          );
      }
      doc.moveDown(1);

      this.sectionTitle(doc, 'Top publicaciones');
      for (const post of input.summary.topPosts.slice(0, 5)) {
        const caption = (post.caption ?? 'Sin caption').slice(0, 80);
        doc
          .fontSize(9)
          .fillColor('#4b5563')
          .text(
            `• [${post.platform ?? '?'}] ${caption} — engagement ${post.engagement}, likes ${post.likes}`,
          );
      }
      doc.moveDown(1);

      this.sectionTitle(doc, 'Análisis IA');
      doc.fontSize(10).fillColor('#111827').text('Resumen ejecutivo', { underline: true });
      doc.fontSize(9).fillColor('#374151').text(input.narrative.executiveSummary);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#111827').text('Destacados por red', { underline: true });
      doc.fontSize(9).fillColor('#374151').text(input.narrative.platformHighlights);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#111827').text('Recomendaciones', { underline: true });
      doc.fontSize(9).fillColor('#374151').text(input.narrative.recommendations);

      doc.end();
    });
  }

  private sectionTitle(doc: PdfDoc, title: string) {
    doc.fontSize(13).fillColor('#1d4ed8').text(title);
    doc.moveDown(0.3);
  }

  private drawMetricBars(doc: PdfDoc, summary: AnalyticsSummary) {
    const metrics = [
      { label: 'Likes', value: summary.metricBreakdown.likes, color: '#1877F2' },
      { label: 'Comentarios', value: summary.metricBreakdown.comments, color: '#E4405F' },
      { label: 'Compartidos', value: summary.metricBreakdown.shares, color: '#6366f1' },
      { label: 'Guardados', value: summary.metricBreakdown.saves, color: '#10b981' },
    ];
    const max = Math.max(...metrics.map((m) => m.value), 1);
    const barMaxWidth = 400;
    const startX = 120;
    let y = doc.y;

    doc.fontSize(9).fillColor('#6b7280').text('Métricas agregadas', 50, y);
    y += 18;

    for (const m of metrics) {
      doc.fillColor('#374151').text(m.label, 50, y + 2, { width: 65 });
      const width = Math.round((m.value / max) * barMaxWidth);
      doc.rect(startX, y, width, 14).fill(m.color);
      doc.fillColor('#111827').text(String(m.value), startX + width + 8, y + 2);
      y += 22;
    }
    doc.y = y;
  }
}
