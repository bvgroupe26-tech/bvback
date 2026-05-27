import { Module } from '@nestjs/common';
import { CandidaturesService } from './candidatures.service';
import { OffresService } from './offres.service';
import { RecrutementController } from './recrutement.controller';

@Module({
  controllers: [RecrutementController],
  providers: [OffresService, CandidaturesService],
  exports: [OffresService, CandidaturesService],
})
export class RecrutementModule {}
