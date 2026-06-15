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

  @Post(':id/ensure-employe')
  @Roles('admin', 'rh')
  @HttpCode(200)
  @ApiOperation({
    summary: "Créer ou récupérer la fiche employé liée à un compte staff",
    description:
      "Idempotent : retourne l'ID existant si la fiche existe déjà, sinon la crée.",
  })
  @ApiParam({ name: 'id', type: Number, example: 3 })
  @ApiOkDataResponse('ID de la fiche employé')
  @ApiNotFoundResponse('Utilisateur')
  @ApiAuthResponses()
  ensureEmploye(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ employe_id: number }> {
    return this.usersService.ensureEmployeForUser(id);
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
