import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NiveauCompetence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCompetenceDto {
  @ApiProperty({
    example: 18,
    description: 'Collaborateur BV Groupe dont on enrichit le profil de compétences.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeId!: number;

  @ApiProperty({
    example: 'Gestion budgétaire sous SAP',
    description:
      'Libellé de la compétence métier, technique ou transverse.',
  })
  @IsString()
  @IsNotEmpty()
  nomCompetence!: string;

  @ApiProperty({
    enum: NiveauCompetence,
    example: NiveauCompetence.avance,
    description:
      'Niveau observé : débutant, intermédiaire, avancé ou expert (référentiel RH BV Groupe).',
  })
  @IsEnum(NiveauCompetence)
  niveau!: NiveauCompetence;

  @ApiPropertyOptional({
    example: 'Finance & Contrôle de gestion',
    description:
      'Famille ou domaine de compétences pour les matrices développement RH.',
  })
  @IsOptional()
  @IsString()
  categorie?: string;
}
