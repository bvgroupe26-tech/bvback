import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryExportDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  annee!: number;

  @ApiPropertyOptional({ example: 'csv', enum: ['csv'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}
