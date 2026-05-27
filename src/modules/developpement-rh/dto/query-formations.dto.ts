import { ApiPropertyOptional } from '@nestjs/swagger';
import { TypeFormation } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class QueryFormationsDto {
  @ApiPropertyOptional({
    example: 22,
    description: 'Historique des formations pour un collaborateur donné.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employe_id?: number;

  @ApiPropertyOptional({
    enum: TypeFormation,
    example: TypeFormation.formation,
    description: 'Filtre sur la nature du parcours enregistré.',
  })
  @IsOptional()
  @IsEnum(TypeFormation)
  type?: TypeFormation;
}
