import { PartialType } from '@nestjs/swagger';
import { CreatePresenceDto } from './create-presence.dto';

export class UpdatePresenceDto extends PartialType(CreatePresenceDto) {}
