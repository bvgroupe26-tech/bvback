import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutBudgetDepense } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryDepensesDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enveloppe_id?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categorie_id?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fournisseur_id?: number;

  @ApiPropertyOptional({ enum: StatutBudgetDepense })
  @IsOptional()
  @IsEnum(StatutBudgetDepense)
  statut?: StatutBudgetDepense;

  @ApiPropertyOptional({ example: 'licence', description: 'Recherche libellé, fournisseur, référence.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: '1', description: '1 = uniquement mes dépenses (demandeur).' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === '1' || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_to?: string;
}
