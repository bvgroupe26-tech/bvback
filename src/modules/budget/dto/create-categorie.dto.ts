import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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

  @ApiPropertyOptional({
    example: '6052',
    description: 'Compte SYSCOHADA de charge associé (classe 6).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^6\d{1,7}$/, { message: 'Le compte SYSCOHADA doit être un compte de classe 6 (ex. 6052).' })
  compteSyscohada?: string;
}
