import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { MediaStorageService } from '../../media/media-storage.service';
import { buildStoryCaptionSvg, wrapStoryCaption } from './story-caption-layout';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const CAPTION_ZONE_HEIGHT = 420;
const MEDIA_ZONE_HEIGHT = STORY_HEIGHT - CAPTION_ZONE_HEIGHT;

@Injectable()
export class StoryMediaComposerService {
  private readonly logger = new Logger(StoryMediaComposerService.name);

  constructor(private readonly mediaStorage: MediaStorageService) {}

  /**
   * Genera una imagen 9:16 con la foto arriba y el caption abajo (estilo preview Meta).
   * La API oficial de Instagram/Facebook no acepta caption en STORIES; el texto va en la imagen.
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
      .resize(STORY_WIDTH, MEDIA_ZONE_HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 92 })
      .toBuffer();

    const captionSvg = buildStoryCaptionSvg(lines, STORY_WIDTH, CAPTION_ZONE_HEIGHT);
    const captionPart = await sharp(Buffer.from(captionSvg)).png().toBuffer();

    const composed = await sharp({
      create: {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        channels: 3,
        background: '#000000',
      },
    })
      .composite([
        { input: imagePart, top: 0, left: 0 },
        { input: captionPart, top: MEDIA_ZONE_HEIGHT, left: 0 },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    const saved = await this.mediaStorage.save({
      agencyId,
      buffer: composed,
      extension: 'jpg',
      contentType: 'image/jpeg',
    });

    this.logger.log(`Story compuesta con caption (${lines.length} líneas) para agencia ${agencyId}`);
    return saved.storageUrl;
  }
}
