import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TypeFormation } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateFormationDto {
  @ApiProperty({
    example: 22,
    description: 'Collaborateur BV Groupe ayant suivi ou obtenu la certification.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeId!: number;

  @ApiProperty({
    example: 'Sécurité sur chantier — normes locales',
    description: 'Intitulé de la formation ou du certificat.',
  })
  @IsString()
  @IsNotEmpty()
  titre!: string;

  @ApiPropertyOptional({
    enum: TypeFormation,
    example: TypeFormation.certification,
    description:
      'Type de parcours : formation interne/externe, certification professionnelle, e-learning, etc.',
  })
  @IsOptional()
  @IsEnum(TypeFormation)
  type?: TypeFormation;

  @ApiPropertyOptional({
    example: 'CNPS / organisme agréé Yaoundé',
    description: 'Organisme formateur ou certificateur.',
  })
  @IsOptional()
  @IsString()
  organisme?: string;

  @ApiPropertyOptional({
    example: '2026-03-14',
    description: 'Date à laquelle la formation a été validée ou le diplôme délivré.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateObtention?: string;

  @ApiPropertyOptional({
    example: '2029-03-14',
    description:
      'Fin de validité pour les certifications périodiques (HSE, habilitation électrique…).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateExpiration?: string;

  @ApiPropertyOptional({
    example: '/formations/2026/hse-attestation-n22.pdf',
    description: 'Chemin du justificatif archivé dans le dossier développement RH.',
  })
  @IsOptional()
  @IsString()
  fichierPath?: string;
}
