import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCandidatureDto } from './create-candidature.dto';

export class UpdateCandidatureDto extends PartialType(
  OmitType(CreateCandidatureDto, ['offreId'] as const),
) {}
