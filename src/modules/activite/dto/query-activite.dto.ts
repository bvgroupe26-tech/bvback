import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QueryActiviteDto {
  @ApiPropertyOptional({
    default: 50,
    example: 50,
    description:
      'Nombre maximal d’événements ou entrées d’activité retournés (flux récent du collaborateur ou global).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    example: 14,
    description:
      'Limite le journal d’activité aux actions concernant cet employé BV Groupe.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employe_id?: number;
}
