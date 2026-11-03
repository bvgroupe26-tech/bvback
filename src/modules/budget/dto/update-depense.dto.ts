import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { CreateDepenseDto } from './create-depense.dto';

export class UpdateDepenseDto extends PartialType(
  OmitType(CreateDepenseDto, ['categorieId', 'fournisseurId'] as const),
) {
  @ApiPropertyOptional({ example: 2, nullable: true, description: 'null retire la catégorie.' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categorieId?: number | null;

  @ApiPropertyOptional({ example: 7, nullable: true, description: 'null retire le fournisseur.' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fournisseurId?: number | null;
}
