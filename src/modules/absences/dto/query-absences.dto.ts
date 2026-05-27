import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutAbsence, TypeAbsence } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional } from 'class-validator';

export class QueryAbsencesDto {
  @ApiPropertyOptional({
    example: 12,
    description: 'Filtre sur l’identifiant du collaborateur concerné.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employe_id?: number;

  @ApiPropertyOptional({
    enum: StatutAbsence,
    example: StatutAbsence.approuve,
    description: 'Statut de traitement de la demande d’absence.',
  })
  @IsOptional()
  @IsEnum(StatutAbsence)
  statut?: StatutAbsence;

  @ApiPropertyOptional({
    enum: TypeAbsence,
    example: TypeAbsence.conge_paye,
    description: 'Type d’absence à inclure dans les résultats.',
  })
  @IsOptional()
  @IsEnum(TypeAbsence)
  type_absence?: TypeAbsence;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description: 'Début de période pour intersecter les absences (AAAA-MM-JJ).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_from?: string;

  @ApiPropertyOptional({
    example: '2026-05-31',
    description: 'Fin de période pour intersecter les absences (AAAA-MM-JJ).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date_to?: string;
}
