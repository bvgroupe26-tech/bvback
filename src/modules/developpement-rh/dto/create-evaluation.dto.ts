import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateEvaluationDto {
  @ApiProperty({
    example: 9,
    description: 'Collaborateur BV Groupe évalué lors de cet entretien ou bilan.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeId!: number;

  @ApiProperty({
    example: '2026-S1',
    description:
      'Période couverte (ex. semestre 2026-S1, campagne annuelle 2026). Convention interne RH.',
  })
  @IsString()
  @IsNotEmpty()
  periode!: string;

  @ApiProperty({
    example: 8,
    minimum: 0,
    maximum: 10,
    description:
      'Note sur 10 pour la régularité des horaires et le respect des consignes de présence.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  ponctualite!: number;

  @ApiProperty({
    example: 7.5,
    minimum: 0,
    maximum: 10,
    description:
      'Évaluation de la qualité du rendu (exactitude, conformité aux procédures BV Groupe).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  qualiteTravail!: number;

  @ApiProperty({
    example: 8,
    minimum: 0,
    maximum: 10,
    description:
      'Capacité à collaborer avec les équipes terrain et siège (Douala, Yaoundé, chantiers).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  travailEquipe!: number;

  @ApiProperty({
    example: 7,
    minimum: 0,
    maximum: 10,
    description:
      'Proactivité, proposition d’amélioration et prise d’initiative dans le périmètre du poste.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  initiative!: number;

  @ApiPropertyOptional({
    example:
      'Points forts sur la relation client ; axe de progrès sur la documentation interne.',
    description: 'Synthèse qualitative complémentaire aux notes chiffrées.',
  })
  @IsOptional()
  @IsString()
  commentaire?: string;

  @ApiPropertyOptional({
    example: 'Nkodo Jean-Marie — Manager Supply Chain',
    description:
      'Identité du ou de la manager ayant conduit l’entretien ou validé la grille.',
  })
  @IsOptional()
  @IsString()
  evaluateur?: string;
}
