import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutBudgetEnveloppe } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class QueryEnveloppesDto {
  @ApiPropertyOptional({
    example: 2026,
    description: 'Ne retourne que les enveloppes rattachées à cette année d’exercice.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee?: number;

  @ApiPropertyOptional({
    enum: StatutBudgetEnveloppe,
    example: StatutBudgetEnveloppe.actif,
    description: 'Filtre sur le statut opérationnel des enveloppes budgétaires.',
  })
  @IsOptional()
  @IsEnum(StatutBudgetEnveloppe)
  statut?: StatutBudgetEnveloppe;
}
