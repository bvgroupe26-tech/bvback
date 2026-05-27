import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFormationDto } from './create-formation.dto';

export class UpdateFormationDto extends PartialType(
  OmitType(CreateFormationDto, ['employeId'] as const),
) {}
