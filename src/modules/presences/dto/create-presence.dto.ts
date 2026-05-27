import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutPresence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const HEURE_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePresenceDto {
  @ApiProperty({
    example: 12,
    description: 'Identifiant du collaborateur BV Groupe concerné par la présence.',
  })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  employeId!: number;

  @ApiProperty({
    example: '2026-05-15',
    description: 'Jour de travail au format ISO (AAAA-MM-JJ), fuseau Cameroun.',
  })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiPropertyOptional({
    example: '07:45',
    description: 'Heure d’arrivée au format HH:mm (ex. entrée au siège ou sur chantier).',
  })
  @IsOptional()
  @IsString()
  @Matches(HEURE_REGEX, { message: 'heureEntree doit être au format HH:mm' })
  heureEntree?: string;

  @ApiPropertyOptional({
    example: '17:15',
    description: 'Heure de départ réelle au format HH:mm.',
  })
  @IsOptional()
  @IsString()
  @Matches(HEURE_REGEX, { message: 'heureSortie doit être au format HH:mm' })
  heureSortie?: string;

  @ApiProperty({
    enum: StatutPresence,
    example: StatutPresence.present,
    description:
      'Statut du jour : présent, retard, absent autorisé, télétravail, etc. (selon grille BV Groupe).',
  })
  @IsEnum(StatutPresence)
  statut!: StatutPresence;

  @ApiPropertyOptional({
    example: 'Réunion client à Bonabéri jusqu’à 10 h.',
    description: 'Motif ou précision si le statut l’exige (retard, mission, exemption).',
  })
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiPropertyOptional({
    default: 0,
    example: 1.5,
    description:
      'Heures supplémentaires déclarées pour le jour (en heures décimales, ex. 1,5 h).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  heuresSupplementaires?: number;
}
