import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCompetenceDto } from './create-competence.dto';

export class UpdateCompetenceDto extends PartialType(
  OmitType(CreateCompetenceDto, ['employeId'] as const),
) {}
