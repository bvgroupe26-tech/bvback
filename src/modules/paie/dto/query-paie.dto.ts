import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatutPaie } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { MOIS_REGEX, NormalizeMois } from '../../../common/transforms/normalize-mois.transform';

export class QueryPaieDto {
  @ApiPropertyOptional({
    example: '05',
    description: 'Filtre sur le mois du bulletin (même convention que lors de la création).',
  })
  @IsOptional()
  @NormalizeMois()
  @IsString()
  @Matches(MOIS_REGEX, { message: 'mois doit être compris entre "01" et "12"' })
  mois?: string;

  @ApiPropertyOptional({
    example: 2026,
    description: 'Filtre sur l’année d’exercice des bulletins retournés.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee?: number;

  @ApiPropertyOptional({
    enum: StatutPaie,
    example: StatutPaie.paye,
    description: 'Restreint aux bulletins selon leur statut de traitement ou de paiement.',
  })
  @IsOptional()
  @IsEnum(StatutPaie)
  statut?: StatutPaie;

  @ApiPropertyOptional({
    example: 12,
    description: 'Identifiant du collaborateur pour lister uniquement ses bulletins.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employe_id?: number;
}
