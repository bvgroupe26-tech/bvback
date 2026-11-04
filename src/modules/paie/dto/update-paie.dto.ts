import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { StatutPaie } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { CreatePaieDto } from './create-paie.dto';

/** Bulletins legacy : le passage en payé / annulé se fait ici, jamais à la création. */
export class UpdatePaieDto extends PartialType(OmitType(CreatePaieDto, ['statut'] as const)) {
  @ApiPropertyOptional({ enum: [StatutPaie.en_attente, StatutPaie.paye, StatutPaie.annule] })
  @IsOptional()
  @IsIn([StatutPaie.en_attente, StatutPaie.paye, StatutPaie.annule])
  statut?: StatutPaie;
}
