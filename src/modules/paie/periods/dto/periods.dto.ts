import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ModePaiement, SourceVariablePaie, TypeRubrique } from '@prisma/client';

export class CreatePeriodeDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  annee!: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mois!: number;
}

export class PayerPeriodeDto {
  @ApiProperty({ example: '2026-05-30' })
  @IsDateString()
  datePaiement!: string;

  @ApiPropertyOptional({ enum: ModePaiement })
  @IsOptional()
  @IsEnum(ModePaiement)
  modePaiement?: ModePaiement;
}

export class VariableInputDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @Type(() => Number)
  @IsInt()
  employeId!: number;

  @Type(() => Number)
  @IsInt()
  payRuleId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantite?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  montant?: number | null;

  @IsOptional()
  @IsEnum(SourceVariablePaie)
  source?: SourceVariablePaie;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}

export class SaveVariablesDto {
  @ApiProperty({ type: [VariableInputDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => VariableInputDto)
  variables!: VariableInputDto[];
}

export class RappelLigneDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  @IsIn([TypeRubrique.gain, TypeRubrique.retenue])
  type!: TypeRubrique;

  @Type(() => Number)
  @IsNumber()
  montant!: number;

  @IsOptional()
  @IsBoolean()
  imposable?: boolean;
}

export class RappelDto {
  @ApiPropertyOptional({
    description: 'Période ouverte qui portera le rappel (défaut : celle du bulletin d’origine, si elle est encore ouverte)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  periodId?: number;

  @ApiProperty({ type: [RappelLigneDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RappelLigneDto)
  lignes!: RappelLigneDto[];
}
