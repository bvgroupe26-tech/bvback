import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutCandidature } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class QueryCandidaturesDto {
  @ApiPropertyOptional({
    example: 7,
    description: 'Liste uniquement les candidatures attachées à cette offre d’emploi.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offre_id?: number;

  @ApiPropertyOptional({
    enum: StatutCandidature,
    example: StatutCandidature.en_cours,
    description: 'Filtre sur l’état actuel du dossier candidat.',
  })
  @IsOptional()
  @IsEnum(StatutCandidature)
  statut?: StatutCandidature;
}
