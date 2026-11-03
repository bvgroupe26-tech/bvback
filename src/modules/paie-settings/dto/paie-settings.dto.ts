import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ModeCalculRubrique, TypeRubrique } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EmptyStringToUndefined } from '../../../common/transforms/empty-string-to-undefined.transform';

const CODE_REGEX = /^[A-Z][A-Z0-9_]{1,39}$/;
const CODE_MESSAGE = 'Code invalide : majuscules, chiffres et _ (ex. TX_CNSS_PENSION_SAL)';

export class UpdateEmployeurDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) raisonSociale?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) adresse?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) ville?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) telephone?: string | null;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) niu?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) rccm?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) numeroCnssEmployeur?: string | null;

  @ApiPropertyOptional({ description: 'URL https d’un logo PNG ou JPEG' })
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(/^https:\/\//, { message: 'Le logo doit être une URL https' })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) conventionCollective?: string | null;
}

export class CreatePayRuleDto {
  @ApiProperty({ example: 'PRIME_RESPONSABILITE' })
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  code!: string;

  @ApiProperty({ example: 'Prime de responsabilité' })
  @IsString()
  @MaxLength(120)
  libelle!: string;

  @ApiProperty({ enum: TypeRubrique })
  @IsEnum(TypeRubrique)
  type!: TypeRubrique;

  @ApiProperty({ enum: ModeCalculRubrique })
  @IsEnum(ModeCalculRubrique)
  mode!: ModeCalculRubrique;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ordre?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() imposable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() soumisCnss?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;

  @ApiPropertyOptional({ description: 'Code de base (rubrique, agrégat BRUT… ou paramètre)' })
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  baseCode?: string | null;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  tauxSalarialCode?: string | null;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  tauxPatronalCode?: string | null;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  plafondCode?: string | null;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  baremeCode?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}

export class UpdatePayRuleDto extends PartialType(CreatePayRuleDto) {}

export class CreatePayParameterDto {
  @ApiProperty({ example: 'TX_CNSS_PENSION_SAL' })
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  code!: string;

  @ApiProperty({ example: 4, description: 'Taux en %, montant en FCFA ou nombre selon le paramètre' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  valeur!: number;

  @ApiProperty({ example: '2026-01-01', description: 'Date d’entrée en vigueur' })
  @IsISO8601({ strict: true })
  dateDebut!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string | null;
}

export class UpdatePayParameterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  valeur?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string | null;
}

export class QueryAtDateDto {
  @ApiPropertyOptional({ example: '2026-05-31' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @ApiPropertyOptional()
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  code?: string;
}

export class BracketDto {
  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  borneMin!: number;

  @ApiPropertyOptional({ example: 464000, nullable: true, description: 'null = tranche ouverte' })
  @ValidateIf((o: BracketDto) => o.borneMax !== null && o.borneMax !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  borneMax!: number | null;

  @ApiProperty({ example: 1, description: 'Taux en %' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  taux!: number;
}

export class CreateBaremeDto {
  @ApiProperty({ example: 'IRPP' })
  @Matches(CODE_REGEX, { message: CODE_MESSAGE })
  bareme!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsISO8601({ strict: true })
  dateDebut!: string;

  @ApiProperty({ type: [BracketDto] })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => BracketDto)
  tranches!: BracketDto[];
}

export class UpdateBracketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  borneMin?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o: UpdateBracketDto) => o.borneMax !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  borneMax?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  taux?: number;
}

export class CreateEmployeeRubriqueDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  payRuleId!: number;

  @ApiPropertyOptional({ description: 'Montant fixe (FCFA)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  montant?: number | null;

  @ApiPropertyOptional({ description: 'Taux propre au salarié (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  taux?: number | null;

  @ApiProperty({ example: '2026-01-01' })
  @IsISO8601({ strict: true })
  dateDebut!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @EmptyStringToUndefined()
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFin?: string | null;
}

export class UpdateEmployeeRubriqueDto extends PartialType(CreateEmployeeRubriqueDto) {}
