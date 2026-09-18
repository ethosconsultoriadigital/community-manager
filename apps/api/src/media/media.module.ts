import { Module } from '@nestjs/common';
import { MediaFilesController } from './media-files.controller';
import { MediaStorageService } from './media-storage.service';
import { MediaUploadController } from './media-upload.controller';
import { MediaUploadService } from './media-upload.service';

@Module({
  controllers: [MediaFilesController, MediaUploadController],
  providers: [MediaStorageService, MediaUploadService],
  exports: [MediaStorageService, MediaUploadService],
})
export class MediaModule {}
