import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { USER_ROLE, type UserRole } from '../../../prisma/user-role';

export class CreateUserDto {
  @ApiProperty({
    example: 'nouveau@bvgroupe.com',
    description:
      'Adresse e-mail professionnelle utilisée pour la connexion au portail RH BV Groupe.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    minLength: 8,
    example: 'SecuriteBv2026!',
    description:
      'Mot de passe (minimum 8 caractères). À communiquer au collaborateur par un canal sécurisé.',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'Nzamba',
    description: 'Nom de famille du collaborateur ou du futur utilisateur.',
  })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiProperty({
    example: 'Clarisse',
    description: 'Prénom du collaborateur ou du futur utilisateur.',
  })
  @IsString()
  @MinLength(1)
  prenom!: string;

  @ApiProperty({
    enum: USER_ROLE,
    example: USER_ROLE.rh,
    description:
      'Rôle applicatif : administrateur technique, manager opérationnel ou équipe RH.',
  })
  @IsEnum(USER_ROLE)
  role!: UserRole;

  @ApiPropertyOptional({
    example: 500000,
    description: 'Salaire de base mensuel (FCFA). Utilisé pour la fiche employé auto-créée.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaireBase?: number;
}
