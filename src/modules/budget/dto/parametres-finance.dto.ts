import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateParametresFinanceDto {
  @ApiPropertyOptional({ example: 18, description: 'Taux de TVA par défaut (%).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tauxTvaDefaut?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Pièce justificative obligatoire à partir de ce montant TTC (0 = jamais).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  seuilJustificatif?: number;

  @ApiPropertyOptional({
    example: 1000000,
    description: 'Validation N2 (admin) au-delà de ce montant TTC (0 = un seul niveau).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  seuilValidationN2?: number;

  @ApiPropertyOptional({
    example: '2026-03-31',
    nullable: true,
    description: 'Période close jusqu’à cette date incluse (null = aucune).',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  periodeCloseJusquau?: string | null;
}
