import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutPresence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
} from 'class-validator';

export class QueryPresencesDto {
  @ApiPropertyOptional({
    example: '2026-05-15',
    description: 'Filtre sur une date précise de présence (AAAA-MM-JJ).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'Identifiant du collaborateur pour restreindre les pointages retournés.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employe_id?: number;

  @ApiPropertyOptional({
    enum: StatutPresence,
    example: StatutPresence.present,
    description: 'Filtre sur le statut de présence (présent, absent, retard…).',
  })
  @IsOptional()
  @IsEnum(StatutPresence)
  statut?: StatutPresence;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description: 'Borne inférieure d’une plage de dates (inclus).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_from?: string;

  @ApiPropertyOptional({
    example: '2026-05-31',
    description: 'Borne supérieure d’une plage de dates (inclus).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_to?: string;

  @ApiPropertyOptional({
    minimum: 1,
    example: 100,
    description: 'Nombre maximal d’enregistrements de présence retournés.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
