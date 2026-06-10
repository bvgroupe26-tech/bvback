import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { Employe } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { CreateEmployeDto } from './dto/create-employe.dto';
import {
  CreatePosteReferentielDto,
  RemovePosteReferentielDto,
} from './dto/poste-referentiel.dto';
import { QueryEmployesDto } from './dto/query-employes.dto';
import { UpdateEmployeDto } from './dto/update-employe.dto';
import { EmployesService } from './employes.service';
import { EmployesStatsResponse } from './types/employes-stats.type';

@ApiTags('employes')
@ApiBearerAuth('JWT')
@Controller('employes')
export class EmployesController {
  constructor(private readonly employesService: EmployesService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Statistiques employés',
    description: 'Effectifs, répartition par département/contrat et masse salariale.',
  })
  @ApiOkDataResponse('Statistiques agrégées')
  @ApiAuthResponses()
  getStats(): Promise<EmployesStatsResponse> {
    return this.employesService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'Lister les employés', description: 'Filtres, tri et limite optionnels.' })
  @ApiQuery({ type: QueryEmployesDto })
  @ApiOkDataResponse('Liste des employés')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAll(@Query() query: QueryEmployesDto): Promise<Employe[]> {
    return this.employesService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un employé' })
  @ApiBody({ type: CreateEmployeDto })
  @ApiCreatedDataResponse('Employé créé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  create(@Body() dto: CreateEmployeDto): Promise<Employe> {
    return this.employesService.create(dto);
  }

  @Get('postes/referentiel')
  @ApiOperation({
    summary: 'Référentiel des postes',
    description: 'Liste partagée des intitulés de poste (base de données).',
  })
  @ApiOkDataResponse('Liste des postes')
  @ApiAuthResponses()
  listPostesReferentiel(): Promise<string[]> {
    return this.employesService.listPostesReferentiel();
  }

  @Post('postes/referentiel')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter un poste au référentiel' })
  @ApiBody({ type: CreatePosteReferentielDto })
  @ApiCreatedDataResponse('Liste mise à jour')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  addPosteReferentiel(
    @Body() dto: CreatePosteReferentielDto,
  ): Promise<string[]> {
    return this.employesService.addPosteReferentiel(dto.label);
  }

  @Post('postes/referentiel/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un poste du référentiel' })
  @ApiBody({ type: RemovePosteReferentielDto })
  @ApiOkDataResponse('Liste mise à jour')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  removePosteReferentiel(
    @Body() dto: RemovePosteReferentielDto,
  ): Promise<string[]> {
    return this.employesService.removePosteReferentiel(dto.label);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Ma fiche employé',
    description: 'Fiche RH de l\'employé connecté (liée par email au compte User).',
  })
  @ApiOkDataResponse('Fiche employé connecté')
  @ApiNotFoundResponse('Employé')
  @ApiAuthResponses()
  findMine(@CurrentUser() user: UserPayload): Promise<Employe> {
    return this.employesService.findByUserId(user.id);
  }

  @Put('me')
  @ApiOperation({
    summary: 'Mettre à jour ma fiche employé',
    description: 'Mise à jour partielle de la fiche RH liée au compte connecté.',
  })
  @ApiBody({ type: UpdateEmployeDto })
  @ApiOkDataResponse('Fiche employé mise à jour')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateMine(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateEmployeDto,
  ): Promise<Employe> {
    return this.employesService.updateByUserId(user.id, dto);
  }

  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Mettre à jour mon avatar',
    description: 'Upload avatar pour l\'employé connecté.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkDataResponse('Avatar mis à jour')
  @ApiNotFoundResponse('Employé')
  @ApiAuthResponses()
  uploadAvatarMine(
    @CurrentUser() user: UserPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Employe> {
    return this.employesService.updateAvatarByUserId(user.id, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un employé' })
  @ApiParam({ name: 'id', type: Number, example: 1, description: 'Identifiant employé' })
  @ApiOkDataResponse('Fiche employé')
  @ApiNotFoundResponse('Employé')
  @ApiAuthResponses()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Employe> {
    return this.employesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un employé', description: 'Mise à jour partielle.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateEmployeDto })
  @ApiOkDataResponse('Employé mis à jour')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeDto,
  ): Promise<Employe> {
    return this.employesService.update(id, dto);
  }

  @Put(':id/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload avatar employé',
    description: 'Envoie un fichier image comme avatar de l\'employé.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkDataResponse('Avatar mis à jour')
  @ApiNotFoundResponse('Employé')
  @ApiAuthResponses()
  uploadAvatar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Employe> {
    return this.employesService.updateAvatar(id, file);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver un employé',
    description: 'Suppression logique (soft delete) et archivage des données liées.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Employé')
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.employesService.remove(id);
  }
}
