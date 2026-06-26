import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAssetsRepository, PostsRepository } from '@cm/db';
import { MediaStorageService } from '../../media/media-storage.service';
import { CanvaConnectClient } from './canva-connect.client';
import { CanvaReturnJwtService } from './canva-return-jwt.service';
import { CanvaTokenService } from './canva-token.service';

@Injectable()
export class CanvaEditorService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: CanvaTokenService,
    private readonly canva: CanvaConnectClient,
    private readonly returnJwt: CanvaReturnJwtService,
    private readonly posts: PostsRepository,
    private readonly mediaAssets: MediaAssetsRepository,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async createEditUrl(agencyId: string, postId: string) {
    const accessToken = await this.requireCanvaToken(agencyId);
    const post = await this.posts.findById(agencyId, postId);
    if (!post) throw new NotFoundException('Post no encontrado');

    if (!['draft', 'pending_approval'].includes(post.status)) {
      throw new BadRequestException(
        'Solo se puede editar en Canva un borrador o post pendiente de aprobación',
      );
    }

    const design = await this.canva.createSocialDesign(
      accessToken,
      post.caption?.slice(0, 80) || `Post ${postId.slice(0, 8)}`,
    );

    const editUrl = design.urls?.edit_url;
    if (!editUrl) throw new BadRequestException('Canva no devolvió edit_url');

    return {
      designId: design.id,
      editUrl: this.canva.buildEditUrl(editUrl, postId),
    };
  }

  async handleReturn(correlationJwt: string) {
    const payload = await this.returnJwt.verifyCorrelationJwt(correlationJwt);
    const postId = payload.correlation_state;
    if (!postId) {
      throw new BadRequestException('Retorno Canva sin correlation_state (postId)');
    }

    const post = await this.posts.findByIdForCanvaReturn(postId);
    if (!post) throw new NotFoundException('Post no encontrado para retorno Canva');

    if (!['draft', 'pending_approval'].includes(post.status)) {
      throw new BadRequestException(
        'Solo se puede guardar diseño Canva en un borrador o post pendiente de aprobación',
      );
    }

    const accessToken = await this.requireCanvaToken(post.agency_id);
    const exportUrl = await this.canva.exportDesignPng(accessToken, payload.design_id);
    const pngBuffer = await this.canva.downloadBinary(exportUrl);

    const stored = await this.mediaStorage.save({
      agencyId: post.agency_id,
      buffer: pngBuffer,
      extension: 'png',
      contentType: 'image/png',
    });

    await this.mediaAssets.deleteByPost(post.agency_id, postId);
    await this.mediaAssets.create(post.agency_id, {
      postId,
      type: 'image',
      source: 'canva',
      storageUrl: stored.storageUrl,
      width: 1080,
      height: 1080,
    });

    return {
      agencyId: post.agency_id,
      postId,
      designId: payload.design_id,
      storageUrl: stored.storageUrl,
    };
  }

  getFrontendReturnUrl(postId: string): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/composer?canva_return=${postId}`;
  }

  getFrontendErrorUrl(message: string): string {
    const frontend = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontend}/composer?canva_error=${encodeURIComponent(message)}`;
  }

  private async requireCanvaToken(agencyId: string): Promise<string> {
    if (!this.tokens.isIntegrationConfigured()) {
      throw new BadRequestException('Integración Canva no configurada');
    }
    const token = await this.tokens.getAccessToken(agencyId);
    if (!token) {
      throw new BadRequestException('Canva no está conectado para esta agencia');
    }
    return token;
  }
}
