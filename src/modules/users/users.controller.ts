import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiBadRequestResponse,
  ApiCreatedDataResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('JWT')
@UseInterceptors(ClassSerializerInterceptor)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'rh')
  @ApiOperation({ summary: 'Lister les comptes utilisateurs' })
  @ApiOkDataResponse('Liste des utilisateurs (sans mot de passe)')
  @ApiAuthResponses()
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'rh')
  @ApiOperation({ summary: 'Détail d\'un compte utilisateur' })
  @ApiParam({ name: 'id', type: Number, example: 1, description: 'Identifiant utilisateur' })
  @ApiOkDataResponse('Utilisateur trouvé')
  @ApiNotFoundResponse('Utilisateur')
  @ApiAuthResponses()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findByIdOrThrow(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedDataResponse('Utilisateur créé')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Mettre à jour un compte utilisateur' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkDataResponse('Utilisateur mis à jour')
  @ApiNotFoundResponse('Utilisateur')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiResponse({ status: 403, description: 'Dernier administrateur protégé' })
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Post(':id/delete')
  @Roles('admin')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Archiver un compte utilisateur',
    description: 'Suppression logique (soft delete) ; l’email est libéré pour une réinscription.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Utilisateur')
  @ApiResponse({ status: 403, description: 'Impossible de supprimer le dernier admin' })
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.usersService.remove(id);
  }
}
