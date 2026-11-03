import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { MOIS_REGEX, NormalizeMois } from '../../../common/transforms/normalize-mois.transform';

export class GeneratePaieDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'Identifiant de l employé pour limiter la génération à un seul collaborateur. Si absent, tous les employés éligibles sont traités.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employeId?: number;

  @ApiProperty({
    example: '05',
    description:
      'Mois cible pour la génération massive des bulletins (format habituel « 01 »–« 12 »).',
  })
  @NormalizeMois()
  @IsString()
  @IsNotEmpty()
  @Matches(MOIS_REGEX, { message: 'mois doit être compris entre "01" et "12"' })
  mois!: string;

  @ApiProperty({
    example: 2026,
    description:
      'Année pour laquelle les fiches de paie BV Groupe doivent être générées ou recalculées.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee!: number;
}
