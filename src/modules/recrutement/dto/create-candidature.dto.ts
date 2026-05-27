import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatutCandidature } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCandidatureDto {
  @ApiProperty({
    example: 3,
    description: 'Identifiant de l’offre BV Groupe sur laquelle porte la candidature.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offreId!: number;

  @ApiProperty({
    example: 'Essama',
    description: 'Nom du ou de la candidat·e.',
  })
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @ApiProperty({
    example: 'Brigitte',
    description: 'Prénom du ou de la candidat·e.',
  })
  @IsString()
  @IsNotEmpty()
  prenom!: string;

  @ApiPropertyOptional({
    example: 'brigitte.essama@yahoo.fr',
    description: 'Coordonnées pour les échanges RH (facultatif si dossier papier).',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '+237 6 99 88 77 66',
    description: 'Numéro joignable pour convocation entretien à Yaoundé ou Douala.',
  })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({
    example: '/uploads/cv/2026/brigitte-essama.pdf',
    description: 'Chemin ou URL du CV déposé sur le serveur ou le stockage BV Groupe.',
  })
  @IsOptional()
  @IsString()
  cvPath?: string;

  @ApiPropertyOptional({
    example:
      'Motivation pour rejoindre BV Groupe et valoriser l’expérience terrain au Cameroun.',
    description: 'Texte ou lien vers la lettre de motivation.',
  })
  @IsOptional()
  @IsString()
  lettreMotivation?: string;

  @ApiPropertyOptional({
    enum: StatutCandidature,
    default: StatutCandidature.recu,
    example: StatutCandidature.recu,
    description:
      'Étape du pipeline recrutement : reçue, en cours d’étude, retenue ou rejetée.',
  })
  @IsOptional()
  @IsEnum(StatutCandidature)
  statut?: StatutCandidature;
}
