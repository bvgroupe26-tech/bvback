import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Création toujours en brouillon : le statut n'est jamais fourni par le client. */
export class CreateDepenseDto {
  @ApiProperty({ example: 4, description: 'Enveloppe budgétaire d’imputation.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enveloppeId!: number;

  @ApiPropertyOptional({ example: 2, description: 'Catégorie (compte SYSCOHADA).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categorieId?: number;

  @ApiProperty({ example: 'Licences Microsoft 365 — siège' })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiPropertyOptional({
    example: 275424,
    description: 'Montant HT en FCFA. La TVA et le TTC sont calculés par le serveur.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  montantHt?: number;

  @ApiPropertyOptional({
    example: 18,
    description: 'Taux de TVA en %. Défaut : taux des paramètres finance.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tauxTva?: number;

  @ApiPropertyOptional({
    example: 325000,
    description: 'Ancien champ : montant TTC sans TVA. Ignoré si montantHt est fourni.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  montant?: number;

  @ApiProperty({ example: '2026-05-08', description: 'Date de facture ou date comptable.' })
  @IsISO8601({ strict: true })
  dateDepense!: string;

  @ApiPropertyOptional({ example: 7, description: 'Fournisseur du référentiel.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fournisseurId?: number;

  @ApiPropertyOptional({
    example: 'SOREPCO SARL',
    description: 'Fournisseur en texte libre (hors référentiel).',
  })
  @IsOptional()
  @IsString()
  fournisseur?: string;

  @ApiPropertyOptional({ example: 'FAC-2026-01487' })
  @IsOptional()
  @IsString()
  referencePiece?: string;

  @ApiPropertyOptional({ example: 'Urgent — renouvellement avant échéance.' })
  @IsOptional()
  @IsString()
  commentaire?: string;
}
