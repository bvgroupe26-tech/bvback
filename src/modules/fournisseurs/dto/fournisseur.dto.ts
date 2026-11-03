import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFournisseurDto {
  @ApiProperty({ example: 'SOREPCO SARL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nom!: string;

  @ApiPropertyOptional({ example: 'M2026000012345A', description: "Numéro d'identification unique (NIU)." })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  niu?: string;

  @ApiPropertyOptional({ example: 'CG-BZV-01-2020-B12-00123' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  rccm?: string;

  @ApiPropertyOptional({ example: '+242 06 000 00 00' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telephone?: string;

  @ApiPropertyOptional({ example: 'contact@sorepco.cg' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Avenue de la Paix, Brazzaville' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  adresse?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class UpdateFournisseurDto extends PartialType(CreateFournisseurDto) {}

export class QueryFournisseursDto {
  @ApiPropertyOptional({ example: 'sorep', description: 'Recherche sur nom, NIU, RCCM.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: '1', description: '1 = inclure les fournisseurs désactivés.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === '1' || value === 'true')
  @IsBoolean()
  inactifs?: boolean;
}
