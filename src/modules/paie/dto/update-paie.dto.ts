import { PartialType } from '@nestjs/swagger';
import { CreatePaieDto } from './create-paie.dto';

export class UpdatePaieDto extends PartialType(CreatePaieDto) {}
