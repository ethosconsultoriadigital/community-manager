import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { MediaStorageService } from '../../media/media-storage.service';
import { buildStoryCaptionSvg, wrapStoryCaption } from './story-caption-layout';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
/** Zona inferior donde se superpone el texto (sin franja de color). */
const CAPTION_OVERLAY_HEIGHT = 420;

@Injectable()
export class StoryMediaComposerService {
  private readonly logger = new Logger(StoryMediaComposerService.name);

  constructor(private readonly mediaStorage: MediaStorageService) {}

  /**
   * Genera una imagen 9:16 a pantalla completa con el caption superpuesto abajo
   * (fondo transparente; la API de Stories no acepta caption de texto aparte).
   */
  async composeStoryImage(
    imageUrl: string,
    caption: string,
    agencyId: string,
  ): Promise<string> {
    const lines = wrapStoryCaption(caption);
    if (lines.length === 0) {
      return imageUrl;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar la imagen para la story (${response.status})`);
    }

    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    const imagePart = await sharp(sourceBuffer)
      .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 92 })
      .toBuffer();

    const captionSvg = buildStoryCaptionSvg(lines, STORY_WIDTH, CAPTION_OVERLAY_HEIGHT);
    const captionPart = await sharp(Buffer.from(captionSvg)).png().toBuffer();

    const composed = await sharp(imagePart)
      .composite([
        {
          input: captionPart,
          top: STORY_HEIGHT - CAPTION_OVERLAY_HEIGHT,
          left: 0,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    const saved = await this.mediaStorage.save({
      agencyId,
      buffer: composed,
      extension: 'jpg',
      contentType: 'image/jpeg',
    });

    this.logger.log(
      `Story compuesta con caption overlay (${lines.length} líneas) para agencia ${agencyId}`,
    );
    return saved.storageUrl;
  }
}
