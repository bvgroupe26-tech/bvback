import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SITUATION_FAMILIALE,
  type SituationFamiliale,
} from '../../../prisma/situation-familiale';
import {
  STATUT_EMPLOYE,
  type StatutEmploye,
} from '../../../prisma/statut-employe';
import { TYPE_CONTRAT, type TypeContrat } from '../../../prisma/type-contrat';
import { Type } from 'class-transformer';
import { EmptyStringToUndefined } from '../../../common/transforms/empty-string-to-undefined.transform';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ModePaiement } from '@prisma/client';

export class CreateEmployeDto {
  @ApiPropertyOptional({
    example: 'EMP-000123',
    description:
      'Matricule RH unique. Si absent, il est généré automatiquement (format EMP-XXXXXX).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^EMP-\d{6}$/, {
    message: 'Le matricule doit respecter le format EMP-XXXXXX',
  })
  matricule?: string;

  @ApiProperty({
    example: 'Mvondo',
    description: 'Nom de famille du collaborateur (état civil ou usage).',
  })
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @ApiProperty({
    example: 'Patrick',
    description: 'Prénom du collaborateur.',
  })
  @IsString()
  @IsNotEmpty()
  prenom!: string;

  @ApiPropertyOptional({
    example: '1992-03-18',
    description: 'Date de naissance au format ISO (AAAA-MM-JJ), pour le dossier RH.',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsISO8601({ strict: true })
  dateNaissance?: string;

  @ApiPropertyOptional({
    example: '+237 6 77 12 34 56',
    description: 'Numéro de téléphone joignable (mobile ou fixe au Cameroun).',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({
    example: 'patrick.mvondo@bvgroupe.com',
    description: 'E-mail professionnel ou personnel pour les échanges RH.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'Quartier Bastos, Yaoundé',
    description: 'Adresse postale ou lieu de résidence utile au dossier administratif.',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  adresse?: string;

  @ApiPropertyOptional({
    enum: SITUATION_FAMILIALE,
    example: SITUATION_FAMILIALE.marie,
    description: 'Situation matrimoniale déclarée pour les charges et avantages sociaux.',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsEnum(SITUATION_FAMILIALE)
  situationFamiliale?: SituationFamiliale;

  @ApiPropertyOptional({
    default: 0,
    example: 2,
    description: 'Nombre d’enfants à charge déclarés pour la grille salariale ou les allocations.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nombreEnfants?: number;

  @ApiPropertyOptional({
    enum: TYPE_CONTRAT,
    example: TYPE_CONTRAT.CDI,
    description: 'Type de contrat principal (CDI, CDD, stage, etc.).',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsEnum(TYPE_CONTRAT)
  typeContrat?: TypeContrat;

  @ApiPropertyOptional({
    example: 'Responsable exploitation Douala',
    description: 'Intitulé du poste occupé ou à pourvoir au sein de BV Groupe.',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  poste?: string;

  @ApiPropertyOptional({
    example: 'Exploitation & Logistique',
    description: 'Service ou direction de rattachement (organisation interne).',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  departement?: string;

  @ApiPropertyOptional({
    example: '2025-09-01',
    description: 'Date d’entrée effective dans l’entreprise (AAAA-MM-JJ).',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsISO8601({ strict: true })
  dateEmbauche?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description:
      'Date de fin de contrat (AAAA-MM-JJ). Utilisée pour le prorata du dernier mois de paie.',
  })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFinContrat?: string;

  @ApiPropertyOptional({
    enum: STATUT_EMPLOYE,
    default: STATUT_EMPLOYE.actif,
    example: STATUT_EMPLOYE.actif,
    description: 'Statut RH : actif, inactif (départ) ou suspendu.',
  })
  @IsOptional()
  @IsEnum(STATUT_EMPLOYE)
  statut?: StatutEmploye;

  @ApiPropertyOptional({
    default: 0,
    example: 450000,
    description:
      'Salaire de base mensuel indicatif en FCFA (valeur par défaut pour les bulletins).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaireBase?: number;

  @ApiPropertyOptional({
    default: 0,
    example: 25000,
    description: 'Montant par défaut de la prime transport (FCFA).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defPrimeTransport?: number;

  @ApiPropertyOptional({
    default: 0,
    example: 50000,
    description: 'Montant par défaut de la prime logement (FCFA).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defPrimeLogement?: number;

  @ApiPropertyOptional({
    default: 0,
    example: 75000,
    description: 'Montant par défaut de la prime liée à la performance (FCFA).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defPrimePerformance?: number;

  @ApiPropertyOptional({
    default: 0,
    example: 15000,
    description: 'Autres primes récurrentes par défaut (FCFA).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defAutresPrimes?: number;

  @ApiPropertyOptional({
    description:
      'Taux de cotisation CNSS appliqué par défaut sur la fiche employé (entre 0 et 1).',
    example: 0.042,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  defTauxCnss?: number;

  @ApiPropertyOptional({
    description:
      'Taux d’impôt ou retenue à la source par défaut pour les simulations de paie (entre 0 et 1).',
    example: 0.1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  defTauxImpot?: number;

  @ApiPropertyOptional({ example: '1234567-A', description: 'Numéro d’immatriculation CNSS du salarié.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroCnss?: string;

  @ApiPropertyOptional({ example: 'M123456789012A', description: 'Numéro d’identification unique (NIU) fiscal.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  niu?: string;

  @ApiPropertyOptional({ example: 'Cadre', description: 'Catégorie selon la convention collective.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categorie?: string;

  @ApiPropertyOptional({ example: 'B2', description: 'Échelon selon la convention collective.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  echelon?: string;

  @ApiPropertyOptional({ enum: ModePaiement, example: ModePaiement.virement, description: 'Mode de paiement du salaire.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsEnum(ModePaiement)
  modePaiement?: ModePaiement;

  @ApiPropertyOptional({ example: 'BGFI Bank', description: 'Banque du salarié (virement).' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  banque?: string;

  @ApiPropertyOptional({ example: 'CG39 30001 00012 12345678901 23', description: 'RIB / IBAN du salarié.' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  rib?: string;

  @ApiPropertyOptional({ example: '+242 06 123 45 67', description: 'Numéro Mobile Money (MTN / Airtel).' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobileMoney?: string;
}
