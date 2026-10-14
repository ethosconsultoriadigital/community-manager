import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClientsRepository, PostsRepository } from '@cm/db';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { renderHtmlToPdf } from './parrilla/html-to-pdf';
import {
  buildParrillaHtml,
  type ParrillaPostView,
} from './parrilla/parrilla-html.template';

type PdfDoc = InstanceType<typeof PDFDocument>;

type PostForParrilla = NonNullable<Awaited<ReturnType<PostsRepository['findById']>>>;

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
};

@Injectable()
export class ApprovalsParrillaService {
  private readonly logger = new Logger(ApprovalsParrillaService.name);

  constructor(
    private readonly posts: PostsRepository,
    private readonly clients: ClientsRepository,
  ) {}

  async generatePdf(options: {
    agencyId: string;
    clientId: string;
    postIds: string[];
  }): Promise<Buffer> {
    const uniqueIds = [...new Set(options.postIds.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException('Selecciona al menos una publicación');
    }
    if (uniqueIds.length > 40) {
      throw new BadRequestException('Máximo 40 publicaciones por PDF');
    }

    const client = await this.clients.findById(options.agencyId, options.clientId);
    if (!client) {
      throw new BadRequestException('Cliente no encontrado');
    }

    const posts: PostForParrilla[] = [];
    for (const id of uniqueIds) {
      const post = await this.posts.findById(options.agencyId, id);
      if (!post) {
        throw new BadRequestException(`Publicación no encontrada: ${id.slice(0, 8)}…`);
      }
      if (post.client_id !== options.clientId) {
        throw new BadRequestException(
          'Todas las publicaciones del PDF deben ser del mismo cliente',
        );
      }
      if (post.status !== 'pending_approval' && post.status !== 'approved') {
        throw new BadRequestException(
          `Solo se pueden incluir posts pendientes o aprobados (${id.slice(0, 8)}…)`,
        );
      }
      posts.push(post);
    }

    posts.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return this.renderPdf({
      clientName: client.name,
      posts,
      generatedAt: new Date(),
    });
  }

  private async renderPdf(input: {
    clientName: string;
    posts: PostForParrilla[];
    generatedAt: Date;
  }): Promise<Buffer> {
    const logo = this.loadLogo();
    const imageBuffers = await Promise.all(
      input.posts.map(async (post) => {
        const media = [...(post.media_assets ?? [])].sort(
          (a, b) => a.position - b.position,
        )[0];
        if (!media?.storage_url || media.type === 'video') {
          return {
            postId: post.id,
            buffer: null as Buffer | null,
            isVideo: media?.type === 'video',
            contentType: null as string | null,
          };
        }
        const fetched = await this.fetchImageBuffer(media.storage_url);
        return {
          postId: post.id,
          buffer: fetched?.buffer ?? null,
          isVideo: false,
          contentType: fetched?.contentType ?? null,
        };
      }),
    );
    const imagesByPost = new Map(imageBuffers.map((row) => [row.postId, row]));

    try {
      const html = this.buildHtmlDocument(input, imagesByPost, logo);
      const pdf = await renderHtmlToPdf(html);
      this.logger.log(`Parrilla PDF (HTML→Chromium): ${input.posts.length} pieza(s)`);
      return pdf;
    } catch (error) {
      this.logger.warn(
        `HTML→PDF falló; usando PDFKit: ${error instanceof Error ? error.message : error}`,
      );
      return this.renderPdfKit(input, imagesByPost, logo);
    }
  }

  private buildHtmlDocument(
    input: {
      clientName: string;
      posts: PostForParrilla[];
      generatedAt: Date;
    },
    imagesByPost: Map<
      string,
      { buffer: Buffer | null; isVideo: boolean; contentType: string | null }
    >,
    logo: Buffer | null,
  ): string {
    const dateOpts: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    const generatedAtLabel = input.generatedAt.toLocaleDateString('es-MX', dateOpts);
    const first = input.posts[0]?.created_at
      ? new Date(input.posts[0].created_at)
      : input.generatedAt;
    const last = input.posts[input.posts.length - 1]?.created_at
      ? new Date(input.posts[input.posts.length - 1].created_at)
      : input.generatedAt;
    const periodLabel =
      first.toDateString() === last.toDateString()
        ? first.toLocaleDateString('es-MX', dateOpts)
        : `${first.toLocaleDateString('es-MX', dateOpts)} — ${last.toLocaleDateString('es-MX', dateOpts)}`;

    const posts: ParrillaPostView[] = input.posts.map((post, index) => {
      const media = imagesByPost.get(post.id) ?? {
        buffer: null,
        isVideo: false,
        contentType: null,
      };
      return {
        index: index + 1,
        total: input.posts.length,
        clientName: input.clientName,
        caption: (post.caption ?? '').trim() || 'Sin texto',
        hashtags: (post.hashtags ?? []).filter(Boolean),
        destinations: this.destinationLabels(post),
        formatLabel: this.formatLabel(post),
        statusLabel:
          post.status === 'pending_approval'
            ? 'Pendiente de aprobación'
            : 'Aprobado (sin programar)',
        placeName: post.place_name,
        shortId: post.id.slice(0, 8),
        imageDataUrl: media.buffer
          ? this.toDataUrl(media.buffer, media.contentType ?? 'image/jpeg')
          : null,
        isVideo: media.isVideo,
        createdLabel: this.capitalizeDay(
          new Date(post.created_at).toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        ),
      };
    });

    return buildParrillaHtml({
      clientName: input.clientName,
      count: input.posts.length,
      generatedAtLabel,
      periodLabel,
      logoDataUrl: logo ? this.toDataUrl(logo, 'image/png') : null,
      posts,
    });
  }

  private destinationLabels(post: PostForParrilla): string[] {
    const destinations = post.post_targets.map((t) => {
      const platform =
        PLATFORM_LABEL[t.social_accounts.platform] ?? t.social_accounts.platform;
      const page =
        t.social_accounts.username?.trim() ||
        t.social_accounts.external_account_id ||
        null;
      return page ? `${platform} · ${page.startsWith('@') ? page : `@${page}`}` : platform;
    });
    return [...new Set(destinations)];
  }

  private formatLabel(post: PostForParrilla): string {
    const formatParts: string[] = [];
    if (post.video_format === 'reel') formatParts.push('Reel');
    else if (post.media_assets?.some((m) => m.type === 'video')) formatParts.push('Video (feed)');
    else if (post.media_assets?.some((m) => m.type === 'image')) formatParts.push('Imagen');
    else formatParts.push('Texto');
    if (post.also_publish_as_story) formatParts.push('+ Story');
    return formatParts.join(' · ');
  }

  private capitalizeDay(label: string): string {
    if (!label) return label;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private toDataUrl(buffer: Buffer, contentType: string): string {
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  /** Fallback si Chromium no está disponible (local sin Chrome / error de launch). */
  private async renderPdfKit(
    input: {
      clientName: string;
      posts: PostForParrilla[];
      generatedAt: Date;
    },
    imagesByPost: Map<
      string,
      { buffer: Buffer | null; isVideo: boolean; contentType: string | null }
    >,
    logo: Buffer | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawCover(doc, {
        clientName: input.clientName,
        count: input.posts.length,
        generatedAt: input.generatedAt,
        logo,
      });

      input.posts.forEach((post, index) => {
        doc.addPage();
        const media = imagesByPost.get(post.id) ?? { buffer: null, isVideo: false };
        this.drawPostPage(doc, {
          post,
          index: index + 1,
          total: input.posts.length,
          clientName: input.clientName,
          media: { buffer: media.buffer, isVideo: media.isVideo },
        });
      });

      doc.end();
    });
  }

  private drawCover(
    doc: PdfDoc,
    input: {
      clientName: string;
      count: number;
      generatedAt: Date;
      logo: Buffer | null;
    },
  ) {
    const pageWidth = doc.page.width;
    const margin = 48;

    if (input.logo) {
      try {
        doc.image(input.logo, margin, 72, { width: 180 });
      } catch (error) {
        this.logger.warn(`No se pudo dibujar el logo Ethos: ${error}`);
      }
    }

    doc.moveDown(8);
    doc
      .fontSize(28)
      .fillColor('#0f172a')
      .text('PARRILLA DE CONTENIDO', margin, 220, {
        width: pageWidth - margin * 2,
        align: 'center',
      });

    doc
      .fontSize(14)
      .fillColor('#1d4ed8')
      .text('Propuesta para aprobación', {
        align: 'center',
      });

    doc.moveDown(2);
    doc
      .fontSize(16)
      .fillColor('#111827')
      .text(input.clientName, { align: 'center' });

    doc.moveDown(1);
    doc
      .fontSize(11)
      .fillColor('#6b7280')
      .text(
        `${input.count} publicación${input.count === 1 ? '' : 'es'} · ${input.generatedAt.toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`,
        { align: 'center' },
      );

    doc.moveDown(3);
    doc
      .fontSize(10)
      .fillColor('#374151')
      .text(
        'Documento generado desde Community Manager (Ethos Consultoría Digital) para revisión offline. Marca en cada pieza si se aprueba o se rechaza; el community manager aplicará la decisión en el sistema.',
        margin,
        doc.y,
        { width: pageWidth - margin * 2, align: 'center' },
      );

    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .text('www.ethosconsultoriadigital.com', margin, doc.page.height - 72, {
        width: pageWidth - margin * 2,
        align: 'center',
      });
  }

  private drawPostPage(
    doc: PdfDoc,
    input: {
      post: PostForParrilla;
      index: number;
      total: number;
      clientName: string;
      media: { buffer: Buffer | null; isVideo: boolean };
    },
  ) {
    const pageWidth = doc.page.width;
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    const post = input.post;

    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text(`${input.clientName} · Pieza ${input.index} de ${input.total}`, margin, margin, {
        width: contentWidth,
      });

    doc
      .fontSize(16)
      .fillColor('#0f172a')
      .text(`Publicación ${input.index}`, margin, margin + 22, { width: contentWidth });

    doc.moveDown(0.8);
    doc.fontSize(10).fillColor('#374151');
    doc.text(
      `Destinos: ${
        this.destinationLabels(post).length
          ? this.destinationLabels(post).join(' · ')
          : 'Sin destinos'
      }`,
    );
    doc.text(`Formato: ${this.formatLabel(post)}`);
    doc.text(
      `Estado: ${
        post.status === 'pending_approval'
          ? 'Pendiente de aprobación'
          : 'Aprobado (sin programar)'
      }`,
    );
    if (post.place_name) doc.text(`Ubicación: ${post.place_name}`);
    doc.text(`ID: ${post.id.slice(0, 8)}…`);

    doc.moveDown(0.8);
    const mediaTop = doc.y;
    if (input.media.buffer) {
      try {
        doc.image(input.media.buffer, margin, mediaTop, {
          fit: [contentWidth, 220],
          align: 'center',
        });
        doc.y = mediaTop + 230;
      } catch (error) {
        this.logger.warn(`No se pudo incrustar imagen del post ${post.id}: ${error}`);
        doc
          .fontSize(9)
          .fillColor('#9ca3af')
          .text('(No se pudo mostrar la imagen en este PDF)', { align: 'center' });
        doc.moveDown(0.5);
      }
    } else if (input.media.isVideo) {
      doc
        .fontSize(10)
        .fillColor('#6b7280')
        .text('Media: video (vista previa no incluida en el PDF).', {
          align: 'left',
        });
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#111827').text('Texto de publicación', { underline: true });
    doc.moveDown(0.3);
    const caption = (post.caption ?? '').trim() || 'Sin texto';
    doc.fontSize(10).fillColor('#374151').text(caption, { width: contentWidth, align: 'left' });

    const hashtags = (post.hashtags ?? []).filter(Boolean);
    if (hashtags.length) {
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#1d4ed8').text(hashtags.join(' '));
    }

    const decisionY = Math.min(doc.y + 28, doc.page.height - 120);
    doc.y = decisionY;
    doc.fontSize(11).fillColor('#0f172a').text('Decisión del revisor', { underline: true });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#374151');
    this.drawCheckboxLine(doc, 'Aprobar');
    this.drawCheckboxLine(doc, 'Rechazar / solicitar cambios');
    doc.moveDown(0.4);
    doc.text('Comentarios: _________________________________________________');
    doc.moveDown(0.35);
    doc.text('________________________________________________________________');
  }

  private drawCheckboxLine(doc: PdfDoc, label: string) {
    const x = doc.x;
    const y = doc.y;
    doc.rect(x, y, 10, 10).stroke('#6b7280');
    doc.text(`    ${label}`, x, y - 1);
    doc.moveDown(0.55);
  }

  private loadLogo(): Buffer | null {
    const candidates = [
      join(__dirname, '..', 'assets', 'ethos-logo-light.png'),
      join(__dirname, '..', '..', 'assets', 'ethos-logo-light.png'),
      join(process.cwd(), 'apps', 'api', 'assets', 'ethos-logo-light.png'),
      join(process.cwd(), 'assets', 'ethos-logo-light.png'),
    ];
    for (const path of candidates) {
      if (existsSync(path)) {
        try {
          return readFileSync(path);
        } catch {
          /* try next */
        }
      }
    }
    this.logger.warn('Logo Ethos no encontrado para la parrilla PDF');
    return null;
  }

  private async fetchImageBuffer(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/') && !url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)) {
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 8 * 1024 * 1024) return null;
      const mime = contentType.split(';')[0]?.trim() || 'image/jpeg';
      return { buffer, contentType: mime };
    } catch (error) {
      this.logger.warn(`No se pudo descargar media para PDF: ${error}`);
      return null;
    }
  }
}
