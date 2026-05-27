import { Global, Module } from '@nestjs/common';
import { ActiviteController } from './activite.controller';
import { ActiviteService } from './activite.service';

@Global()
@Module({
  controllers: [ActiviteController],
  providers: [ActiviteService],
  exports: [ActiviteService],
})
export class ActiviteModule {}
