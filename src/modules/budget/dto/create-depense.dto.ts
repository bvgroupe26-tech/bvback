import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutBudgetDepense } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDepenseDto {
  @ApiProperty({
    example: 4,
    description: 'Enveloppe budgétaire BV Groupe sur laquelle imputer la dépense.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  enveloppeId!: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Rubrique analytique (catégorie) pour ventiler la charge au-delà de l’enveloppe globale.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categorieId?: number;

  @ApiProperty({
    example: 'Renouvellement licences Microsoft 365 — siège Yaoundé',
    description: 'Libellé opérationnel de la dépense pour audit et rapprochement.',
  })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiProperty({
    example: 325000,
    description: 'Montant engagé en FCFA (hors taxes selon convention interne).',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  montant!: number;

  @ApiProperty({
    example: '2026-05-08',
    description: 'Date comptable ou date de facture fournisseur.',
  })
  @IsISO8601({ strict: true })
  dateDepense!: string;

  @ApiPropertyOptional({
    example: 'SOREPCO SARL — Douala',
    description: 'Prestataire ou fournisseur associé à la pièce justificative.',
  })
  @IsOptional()
  @IsString()
  fournisseur?: string;

  @ApiPropertyOptional({
    example: 'FAC-2026-01487',
    description: 'Référence facture, bon de commande ou engagement interne.',
  })
  @IsOptional()
  @IsString()
  referencePiece?: string;

  @ApiPropertyOptional({
    enum: StatutBudgetDepense,
    example: StatutBudgetDepense.en_attente,
    description:
      'Circuit de validation : en attente, approuvée, refusée ou marquée comme payée.',
  })
  @IsOptional()
  @IsEnum(StatutBudgetDepense)
  statut?: StatutBudgetDepense;

  @ApiPropertyOptional({
    example: 'Urgent — renouvellement avant échéance contrat groupe.',
    description: 'Commentaire pour la fonction finance ou le contrôle de gestion.',
  })
  @IsOptional()
  @IsString()
  commentaire?: string;
}
