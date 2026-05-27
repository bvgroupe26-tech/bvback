import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutAbsence, TypeAbsence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
} from 'class-validator';
import { AbsenceDateRangeConstraint } from './absence-date-range.validator';

export class CreateAbsenceDto {
  @ApiProperty({
    example: 12,
    description: 'Collaborateur BV Groupe pour lequel l’absence est déclarée.',
  })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  employeId!: number;

  @ApiProperty({
    example: '2026-08-04',
    description: 'Premier jour d’absence (AAAA-MM-JJ), ex. début de congés annuels.',
  })
  @IsISO8601({ strict: true })
  dateDebut!: string;

  @ApiProperty({
    example: '2026-08-15',
    description:
      'Dernier jour d’absence (AAAA-MM-JJ). Doit être égal ou postérieur à la date de début.',
  })
  @IsISO8601({ strict: true })
  @Validate(AbsenceDateRangeConstraint)
  dateFin!: string;

  @ApiProperty({
    enum: TypeAbsence,
    example: TypeAbsence.conge_paye,
    description:
      'Nature de l’absence : congé payé, maladie, mission, absence non rémunérée, etc.',
  })
  @IsEnum(TypeAbsence)
  typeAbsence!: TypeAbsence;

  @ApiPropertyOptional({
    example: 'Congés famille à Yaoundé — validation manager RH.',
    description: 'Commentaire ou référence interne (demande papier, mail manager).',
  })
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiPropertyOptional({
    enum: StatutAbsence,
    default: StatutAbsence.en_attente,
    example: StatutAbsence.en_attente,
    description:
      'Workflow de validation : en attente, validée ou refusée par la hiérarchie / RH.',
  })
  @IsOptional()
  @IsEnum(StatutAbsence)
  statut?: StatutAbsence;
}
