import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthUser } from '@cm/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MediaValidationError } from './media-validation';
import { MediaUploadService } from './media-upload.service';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaUploadController {
  constructor(private readonly upload: MediaUploadService) {}

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin', 'owner')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadStandalone(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      return await this.upload.uploadStandalone(user.agencyId, file);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
