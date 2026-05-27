import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@bvgroupe.com',
    description: 'Adresse email du compte',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Admin@2026',
    description: 'Mot de passe du compte',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
