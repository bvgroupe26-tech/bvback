import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModePaiement } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CommentaireActionDto {
  @ApiPropertyOptional({ example: 'Conforme au devis validé.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentaire?: string;
}

export class RefuserDepenseDto {
  @ApiProperty({ example: 'Facture manquante, merci de la joindre.' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif du refus est obligatoire.' })
  @MaxLength(1000)
  motif!: string;
}

export class PayerDepenseDto {
  @ApiProperty({ enum: ModePaiement, example: ModePaiement.virement })
  @IsEnum(ModePaiement)
  modePaiement!: ModePaiement;

  @ApiPropertyOptional({ example: 'VIR-2026-0042' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencePaiement?: string;

  @ApiProperty({ example: '2026-05-12' })
  @IsISO8601({ strict: true })
  datePaiement!: string;
}
