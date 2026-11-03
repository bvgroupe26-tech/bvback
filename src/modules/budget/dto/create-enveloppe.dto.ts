import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutBudgetEnveloppe } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateEnveloppeDto {
  @ApiProperty({
    example: 'Enveloppe masse salariale RH — Cameroun 2026',
    description: 'Nom métier de l’enveloppe budgétaire suivie dans l’outil.',
  })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiProperty({
    example: 2026,
    description: 'Exercice civil ou fiscal auquel rattacher la prévision.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee!: number;

  @ApiProperty({
    example: 285000000,
    description:
      'Montant prévisionnel total en FCFA avant engagement des dépenses.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantPrevu!: number;

  @ApiPropertyOptional({
    example: 'Direction générale Cameroun',
    description:
      'Périmètre organisationnel si l’enveloppe est ventilée par entité ou site.',
  })
  @IsOptional()
  @IsString()
  departement?: string;

  @ApiPropertyOptional({
    enum: StatutBudgetEnveloppe,
    example: StatutBudgetEnveloppe.actif,
    description:
      'Cycle de vie : brouillon interne, enveloppe active ou clôturée en fin d’exercice.',
  })
  @IsOptional()
  @IsEnum(StatutBudgetEnveloppe)
  statut?: StatutBudgetEnveloppe;

  @ApiPropertyOptional({
    example: 'Validation CODIR mars 2026 — révision T2 si embauches planning Douala.',
    description: 'Notes libres pour la traçabilité des arbitrages budgétaires.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 80,
    description: 'Seuil d’alerte de consommation en % du prévu.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  seuilAlertePct?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Refuser toute dépense qui ferait dépasser le prévu.',
  })
  @IsOptional()
  @IsBoolean()
  bloquerDepassement?: boolean;
}
