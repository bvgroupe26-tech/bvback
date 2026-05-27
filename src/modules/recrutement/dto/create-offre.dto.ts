import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  STATUT_OFFRE_EMPLOI,
  type StatutOffreEmploi,
} from '../../../prisma/statut-offre-emploi';
import {
  TYPE_CONTRAT_OFFRE,
  type TypeContratOffre,
} from '../../../prisma/type-contrat-offre';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOffreDto {
  @ApiProperty({
    example: 'Chargé·e de relation client — Douala',
    description: 'Intitulé visible sur la vitrine emploi BV Groupe.',
  })
  @IsString()
  @IsNotEmpty()
  titre!: string;

  @ApiPropertyOptional({
    example: 'Commercial & Relation client',
    description: 'Service ou division qui porte le recrutement.',
  })
  @IsOptional()
  @IsString()
  departement?: string;

  @ApiPropertyOptional({
    enum: TYPE_CONTRAT_OFFRE,
    example: TYPE_CONTRAT_OFFRE.CDI,
    description: 'Type de contrat proposé au candidat (CDI, CDD, stage, freelance).',
  })
  @IsOptional()
  @IsEnum(TYPE_CONTRAT_OFFRE)
  typeContrat?: TypeContratOffre;

  @ApiProperty({
    example:
      'Suivi des comptes grands comptes au Cameroun, reporting hebdomadaire au manager régional.',
    description:
      'Description détaillée du poste, missions quotidiennes et environnement de travail.',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({
    example: 'Anglais professionnel, maîtrise ERP, permis B.',
    description: 'Compétences techniques et comportementales attendues.',
  })
  @IsOptional()
  @IsString()
  competencesRequises?: string;

  @ApiPropertyOptional({
    default: 10,
    example: 5,
    description:
      'Nombre de postes ouverts pour cette vague de recrutement (objectif RH).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cibleCandidats?: number;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description:
      'Date limite de dépôt des candidatures (AAAA-MM-JJ). Passée, l’offre peut être fermée.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateCloture?: string;

  @ApiPropertyOptional({
    enum: STATUT_OFFRE_EMPLOI,
    default: STATUT_OFFRE_EMPLOI.ouverte,
    example: STATUT_OFFRE_EMPLOI.ouverte,
    description:
      'État du processus : ouverte aux candidatures, fermée ou déjà pourvue.',
  })
  @IsOptional()
  @IsEnum(STATUT_OFFRE_EMPLOI)
  statut?: StatutOffreEmploi;
}
