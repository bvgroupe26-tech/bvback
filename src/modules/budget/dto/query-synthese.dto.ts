import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class QuerySyntheseDto {
  @ApiProperty({
    example: 2026,
    description:
      'Année pour laquelle la synthèse agrégée du budget BV Groupe doit être calculée (query obligatoire).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  annee!: number;
}
