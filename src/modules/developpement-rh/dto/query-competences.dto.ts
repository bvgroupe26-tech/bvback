import { ApiPropertyOptional } from '@nestjs/swagger';
import { NiveauCompetence } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryCompetencesDto {
  @ApiPropertyOptional({
    example: 18,
    description: 'Compétences enregistrées pour cet employé uniquement.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employe_id?: number;

  @ApiPropertyOptional({
    example: 'Leadership',
    description: 'Filtre sur la catégorie ou famille déclarée lors du dernier entretien annuel.',
  })
  @IsOptional()
  @IsString()
  categorie?: string;

  @ApiPropertyOptional({
    enum: NiveauCompetence,
    example: NiveauCompetence.intermediaire,
    description: 'Restreint aux compétences dont le niveau correspond à cette valeur.',
  })
  @IsOptional()
  @IsEnum(NiveauCompetence)
  niveau?: NiveauCompetence;
}
