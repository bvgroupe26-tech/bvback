import { PartialType } from '@nestjs/swagger';
import { CreateEnveloppeDto } from './create-enveloppe.dto';

export class UpdateEnveloppeDto extends PartialType(CreateEnveloppeDto) {}
