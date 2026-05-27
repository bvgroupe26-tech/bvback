import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutBudgetDepense } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class QueryDepensesDto {
  @ApiPropertyOptional({
    example: 4,
    description: 'Liste les dépenses imputées sur cette enveloppe budgétaire.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enveloppe_id?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Filtre sur la catégorie budgétaire de la dépense.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categorie_id?: number;

  @ApiPropertyOptional({
    enum: StatutBudgetDepense,
    example: StatutBudgetDepense.approuve,
    description: 'Filtre selon l’étape du workflow de validation ou du paiement.',
  })
  @IsOptional()
  @IsEnum(StatutBudgetDepense)
  statut?: StatutBudgetDepense;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Borne inférieure sur la date de dépense (inclus).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Borne supérieure sur la date de dépense (inclus).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_to?: string;
}
