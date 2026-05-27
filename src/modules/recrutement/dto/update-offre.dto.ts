import { PartialType } from '@nestjs/swagger';
import { CreateOffreDto } from './create-offre.dto';

export class UpdateOffreDto extends PartialType(CreateOffreDto) {}
