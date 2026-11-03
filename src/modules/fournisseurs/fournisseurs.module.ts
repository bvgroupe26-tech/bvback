import { Module } from '@nestjs/common';
import { FournisseursController } from './fournisseurs.controller';
import { FournisseursService } from './fournisseurs.service';

@Module({
  controllers: [FournisseursController],
  providers: [FournisseursService],
  exports: [FournisseursService],
})
export class FournisseursModule {}
