import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { MediaModule } from '../media/media.module';
import { ClientsController } from './clients.controller';

@Module({
  imports: [AccessModule, MediaModule],
  controllers: [ClientsController],
})
export class ClientsModule {}
