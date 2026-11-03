import { PartialType, PickType } from '@nestjs/swagger';
import { CreateEmployeDto } from './create-employe.dto';

/** Champs qu'un collaborateur peut modifier lui-même (aucune donnée de paie ni de statut). */
export class UpdateEmployeMeDto extends PartialType(
  PickType(CreateEmployeDto, ['telephone', 'adresse', 'situationFamiliale'] as const),
) {}
