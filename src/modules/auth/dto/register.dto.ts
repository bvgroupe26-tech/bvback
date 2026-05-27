import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLE, type UserRole } from '../../../prisma/user-role';

export class RegisterDto {
  @ApiProperty({
    example: 'rh@bvgroupe.com',
    description: 'Email professionnel du nouvel utilisateur',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'MotDePasseSecurise8!',
    description: 'Mot de passe (minimum 8 caractères)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Dupont', description: 'Nom de famille' })
  @IsString()
  @MinLength(1)
  nom!: string;

  @ApiProperty({ example: 'Marie', description: 'Prénom' })
  @IsString()
  @MinLength(1)
  prenom!: string;

  @ApiProperty({
    enum: [USER_ROLE.rh, USER_ROLE.manager],
    example: USER_ROLE.rh,
    description: 'Rôle autorisé à l\'inscription (rh ou manager)',
  })
  @IsIn([USER_ROLE.rh, USER_ROLE.manager])
  role!: Extract<UserRole, 'rh' | 'manager'>;
}
