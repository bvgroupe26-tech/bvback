import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class GeneratePaieDto {
  @ApiProperty({
    example: '05',
    description:
      'Mois cible pour la génération massive des bulletins (format habituel « 01 »–« 12 »).',
  })
  @IsString()
  @IsNotEmpty()
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
