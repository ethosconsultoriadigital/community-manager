import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mammoth from 'mammoth';

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class ReferenceMaterialService {
  private readonly logger = new Logger(ReferenceMaterialService.name);

  constructor(private readonly config: ConfigService) {}

  async parseReferenceFile(file: Express.Multer.File): Promise<{ referenceText: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo de referencia');
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      throw new BadRequestException('El archivo de referencia supera 10 MB');
    }

    const mime = file.mimetype.toLowerCase();
    const name = file.originalname.toLowerCase();

    if (mime.startsWith('image/')) {
      const description = await this.describeImage(file.buffer, mime);
      return { referenceText: description };
    }

    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      const text = await this.extractPdfText(file.buffer);
      return { referenceText: text.slice(0, 8000) };
    }

    if (
      mime.includes('wordprocessingml') ||
      mime === 'application/msword' ||
      name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return { referenceText: (result.value ?? '').trim().slice(0, 8000) };
    }

    throw new BadRequestException(
      'Formato no soportado. Usa imagen (JPG/PNG/WebP), PDF o Word (.docx).',
    );
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      return (data.text ?? '').trim();
    } catch (err) {
      this.logger.warn(`PDF parse failed: ${err instanceof Error ? err.message : err}`);
      throw new BadRequestException('No se pudo leer el PDF de referencia');
    }
  }

  private async describeImage(buffer: Buffer, mime: string): Promise<string> {
    const apiKey =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      this.config.get<string>('IMAGE_API_KEY')?.trim() ||
      '';
    if (!apiKey || apiKey.startsWith('sk-ant-')) {
      return (
        'Reference image attached: match its color palette, layout style, and visual mood ' +
        'in the generated social media creative.'
      );
    }

    const b64 = buffer.toString('base64');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Describe this reference image for an AI image generator: style, colors, layout, ' +
                  'typography, mood. Be concise (max 400 words). Focus on what to replicate visually.',
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${b64}` },
              },
            ],
          },
        ],
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      this.logger.warn(`Vision describe failed: HTTP ${response.status}`);
      return 'Reference image: replicate its visual style, colors and composition.';
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return (
      payload.choices?.[0]?.message?.content?.trim() ??
      'Reference image: replicate its visual style, colors and composition.'
    );
  }
}
