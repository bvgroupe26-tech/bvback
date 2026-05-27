import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  STATUT_OFFRE_EMPLOI,
  type StatutOffreEmploi,
} from '../../../prisma/statut-offre-emploi';
import {
  TYPE_CONTRAT_OFFRE,
  type TypeContratOffre,
} from '../../../prisma/type-contrat-offre';

export class QueryOffresDto {
  @ApiPropertyOptional({
    enum: STATUT_OFFRE_EMPLOI,
    example: STATUT_OFFRE_EMPLOI.ouverte,
    description: 'Ne retourne que les offres ayant ce statut dans le vivier BV Groupe.',
  })
  @IsOptional()
  @IsEnum(STATUT_OFFRE_EMPLOI)
  statut?: StatutOffreEmploi;

  @ApiPropertyOptional({
    enum: TYPE_CONTRAT_OFFRE,
    example: TYPE_CONTRAT_OFFRE.CDD,
    description: 'Filtre par type de contrat affiché aux candidats.',
  })
  @IsOptional()
  @IsEnum(TYPE_CONTRAT_OFFRE)
  type_contrat?: TypeContratOffre;

  @ApiPropertyOptional({
    example: 'Supply Chain',
    description: 'Filtre sur le département annoncé dans l’offre.',
  })
  @IsOptional()
  @IsString()
  departement?: string;
}
