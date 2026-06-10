import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreatePosteReferentielDto {
  @ApiProperty({ example: 'Responsable logistique' })
  @IsString()
  @MinLength(2)
  label!: string;
}

export class RemovePosteReferentielDto {
  @ApiProperty({ example: 'Responsable logistique' })
  @IsString()
  @MinLength(2)
  label!: string;
}
