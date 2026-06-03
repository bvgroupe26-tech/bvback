import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description: 'Activer (true) ou désactiver (false) le compte sans le supprimer.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
