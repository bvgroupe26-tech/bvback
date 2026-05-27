import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategorieDto {
  @ApiProperty({
    example: 'RH-FORM',
    description:
      'Code court unique de la catégorie budgétaire (ex. rubrique comptable ou analytique BV Groupe).',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    example: 'Formations & développement des compétences',
    description: 'Libellé lisible dans les tableaux de synthèse budget.',
  })
  @IsString()
  @IsNotEmpty()
  libelle!: string;

  @ApiPropertyOptional({
    example:
      'Regroupe les séminaires internes, certifications externes et ateliers HSE.',
    description: 'Précisions pour les équipes finance et les managers responsables enveloppes.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
