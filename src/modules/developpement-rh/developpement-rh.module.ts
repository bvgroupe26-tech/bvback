import { Module } from '@nestjs/common';
import { CompetencesService } from './competences.service';
import { DeveloppementRhController } from './developpement-rh.controller';
import { EvaluationsService } from './evaluations.service';
import { FormationsService } from './formations.service';

@Module({
  controllers: [DeveloppementRhController],
  providers: [CompetencesService, FormationsService, EvaluationsService],
  exports: [CompetencesService, FormationsService, EvaluationsService],
})
export class DeveloppementRhModule {}
