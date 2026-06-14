import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { USER_ROLE, type UserRole } from '../../../prisma/user-role';

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({
    example: 42,
    description: "Identifiant unique de l'utilisateur dans le système BV Groupe.",
  })
  id!: number;

  @Expose()
  @ApiProperty({
    example: 'clarisse.nzamba@bvgroupe.com',
    description: 'Adresse e-mail de connexion.',
  })
  email!: string;

  @Expose()
  @ApiProperty({
    example: 'Nzamba',
    description: 'Nom de famille.',
  })
  nom!: string;

  @Expose()
  @ApiProperty({
    example: 'Clarisse',
    description: 'Prénom.',
  })
  prenom!: string;

  @Expose()
  @ApiProperty({
    enum: USER_ROLE,
    example: USER_ROLE.rh,
    description: "Rôle attribué (admin, manager, RH ou employé).",
  })
  role!: UserRole;

  @Expose()
  @ApiProperty({
    example: true,
    description: 'Compte actif : false = connexion refusée.',
  })
  isActive!: boolean;

  @Expose()
  @ApiProperty({
    example: '2025-01-10T08:00:00.000Z',
    description: 'Date et heure de création du compte utilisateur.',
  })
  createdAt!: Date;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    example: '2026-05-14T17:30:00.000Z',
    description: "Dernière connexion réussie au portail ; null si l'utilisateur ne s'est jamais connecté.",
  })
  lastLogin!: Date | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    example: 12,
    description: "ID de la fiche employé liée (même email). Null si aucune fiche n'existe.",
  })
  employe_id!: number | null;

  @Exclude()
  passwordHash?: string;
}
