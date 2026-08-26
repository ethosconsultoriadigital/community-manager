import { Global, Module } from '@nestjs/common';
import { ClientAccessService } from './client-access.service';

@Global()
@Module({
  providers: [ClientAccessService],
  exports: [ClientAccessService],
})
export class AccessModule {}
