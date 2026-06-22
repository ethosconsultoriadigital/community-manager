import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import type { Response } from 'express';
import { MediaStorageService } from './media-storage.service';

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

@Controller('media')
export class MediaFilesController {
  constructor(private readonly storage: MediaStorageService) {}

  @Get('files/:agencyId/:fileName')
  serveFile(
    @Param('agencyId') agencyId: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!agencyId || !fileName || fileName.includes('..')) {
      throw new NotFoundException('Archivo no encontrado');
    }

    const storageKey = `${agencyId}/${fileName}`;
    let filePath: string;
    try {
      filePath = this.storage.resolveLocalPath(storageKey);
    } catch {
      throw new NotFoundException('Archivo no encontrado');
    }

    if (!existsSync(filePath)) {
      throw new NotFoundException('Archivo no encontrado');
    }

    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(createReadStream(filePath));
  }
}
