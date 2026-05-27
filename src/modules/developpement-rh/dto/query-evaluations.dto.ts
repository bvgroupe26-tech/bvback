import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryEvaluationsDto {
  @ApiPropertyOptional({
    example: 9,
    description: 'Historique des bilans pour ce collaborateur uniquement.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employe_id?: number;

  @ApiPropertyOptional({
    example: '2026-S1',
    description:
      'Restreint aux évaluations associées à cette période de campagne RH.',
  })
  @IsOptional()
  @IsString()
  periode?: string;
}
