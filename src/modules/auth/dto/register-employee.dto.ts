import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TYPE_CONTRAT, type TypeContrat } from '../../../prisma/type-contrat';

export class RegisterEmployeeDto {
  @ApiProperty({
    example: 'patrick.mvondo@bvgroupe.com',
    description: 'Email professionnel (servira de login)',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'MotDePasse2026!',
    description: 'Mot de passe (minimum 8 caractères)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Mvondo', description: 'Nom de famille' })
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @ApiProperty({ example: 'Patrick', description: 'Prénom' })
  @IsString()
  @IsNotEmpty()
  prenom!: string;

  @ApiPropertyOptional({
    example: '+237 6 77 12 34 56',
    description: 'Numéro de téléphone',
  })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({
    example: 'Quartier Bastos, Yaoundé',
    description: 'Adresse',
  })
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiPropertyOptional({
    example: 'Responsable exploitation',
    description: 'Intitulé du poste',
  })
  @IsOptional()
  @IsString()
  poste?: string;

  @ApiPropertyOptional({
    example: 'Exploitation & Logistique',
    description: 'Département / service',
  })
  @IsOptional()
  @IsString()
  departement?: string;

  @ApiPropertyOptional({
    enum: TYPE_CONTRAT,
    example: 'CDI',
    description: 'Type de contrat',
  })
  @IsOptional()
  @IsEnum(TYPE_CONTRAT)
  typeContrat?: TypeContrat;

  @ApiPropertyOptional({
    example: '2025-09-01',
    description: "Date d'embauche (AAAA-MM-JJ)",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateEmbauche?: string;

  @ApiPropertyOptional({
    example: 450000,
    description: 'Salaire de base mensuel (FCFA)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaireBase?: number;
}
