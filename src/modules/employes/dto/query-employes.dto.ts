import { ApiPropertyOptional } from '@nestjs/swagger';
import { STATUT_EMPLOYE, type StatutEmploye } from '../../../prisma/statut-employe';
import { TYPE_CONTRAT, type TypeContrat } from '../../../prisma/type-contrat';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class QueryEmployesDto {
  @ApiPropertyOptional({
    example: 'Mvondo',
    description:
      'Terme de recherche libre sur le nom, le prénom, l’e-mail ou l’intitulé de poste.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'RH & Paie',
    description: 'Filtre sur le département ou service de rattachement.',
  })
  @IsOptional()
  @IsString()
  departement?: string;

  @ApiPropertyOptional({
    enum: TYPE_CONTRAT,
    example: TYPE_CONTRAT.CDI,
    description: 'Restreint la liste aux collaborateurs ayant ce type de contrat.',
  })
  @IsOptional()
  @IsEnum(TYPE_CONTRAT)
  type_contrat?: TypeContrat;

  @ApiPropertyOptional({
    enum: STATUT_EMPLOYE,
    example: STATUT_EMPLOYE.actif,
    description: 'Filtre sur le statut RH (actif, inactif, suspendu).',
  })
  @IsOptional()
  @IsEnum(STATUT_EMPLOYE)
  statut?: StatutEmploye;

  @ApiPropertyOptional({
    enum: ['nom', 'date_embauche', 'salaire_base', 'recent'],
    default: 'nom',
    example: 'nom',
    description:
      'Critère de tri des résultats : ordre alphabétique, ancienneté ou salaire de base.',
  })
  @IsOptional()
  @IsIn(['nom', 'date_embauche', 'salaire_base', 'recent'])
  sort?: 'nom' | 'date_embauche' | 'salaire_base' | 'recent';

  @ApiPropertyOptional({
    minimum: 1,
    example: 50,
    description: 'Nombre maximum de collaborateurs retournés (pagination / limitation).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
