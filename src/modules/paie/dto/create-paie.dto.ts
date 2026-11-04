import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutPaie } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { MOIS_REGEX, NormalizeMois } from '../../../common/transforms/normalize-mois.transform';

export class CreatePaieDto {
  @ApiProperty({
    example: 12,
    description: 'Collaborateur BV Groupe pour lequel la ligne de paie est créée.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeId!: number;

  @ApiProperty({
    example: '05',
    description:
      'Mois de référence du bulletin (souvent « 01 » à « 12 », ou convention interne BV Groupe).',
  })
  @NormalizeMois()
  @IsString()
  @IsNotEmpty()
  @Matches(MOIS_REGEX, { message: 'mois doit être compris entre "01" et "12"' })
  mois!: string;

  @ApiProperty({
    example: 2026,
    description: 'Année civile du bulletin de paie (exercice salarial).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee!: number;

  @ApiProperty({
    default: 0,
    example: 485000,
    description: 'Salaire de base mensuel en FCFA avant primes.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaireBase!: number;

  @ApiProperty({
    default: 0,
    example: 30000,
    description: 'Prime transport mensuelle (FCFA), selon barème ou accord BV Groupe.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  primeTransport!: number;

  @ApiProperty({
    default: 0,
    example: 60000,
    description: 'Allocation logement ou indemnité équivalente (FCFA).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  primeLogement!: number;

  @ApiProperty({
    default: 0,
    example: 80000,
    description: 'Prime variable liée à la performance ou aux objectifs (FCFA).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  primePerformance!: number;

  @ApiProperty({
    default: 0,
    example: 25000,
    description: 'Autres primes ou indemnités brutes (FCFA).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  autresPrimes!: number;

  @ApiPropertyOptional({
    example: 32490,
    description:
      'Montant des cotisations CNSS retenues sur la période (FCFA), si déjà calculé.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cnss?: number;

  @ApiPropertyOptional({
    example: 48500,
    description:
      'Montant de l’impôt ou des retenues fiscales (FCFA), si déjà calculé.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  impot?: number;

  @ApiProperty({
    default: 0,
    example: 5000,
    description: 'Autres retenues légales ou conventionnelles (FCFA).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  autresRetenues!: number;

  @ApiPropertyOptional({
    enum: [StatutPaie.en_attente],
    default: StatutPaie.en_attente,
    example: StatutPaie.en_attente,
    description:
      'Toujours « en_attente » à la création : le paiement passe par la mise à jour du bulletin.',
  })
  @IsOptional()
  @IsIn([StatutPaie.en_attente], {
    message: 'Un bulletin se crée en attente ; le marquer payé ou annulé ensuite.',
  })
  statut?: StatutPaie;
}
