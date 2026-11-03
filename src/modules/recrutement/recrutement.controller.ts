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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { OffreEmploi } from '@prisma/client';
import { CandidaturesService } from './candidatures.service';
import { CreateCandidatureDto } from './dto/create-candidature.dto';
import { CreateOffreDto } from './dto/create-offre.dto';
import { QueryCandidaturesDto } from './dto/query-candidatures.dto';
import { QueryOffresDto } from './dto/query-offres.dto';
import { UpdateCandidatureDto } from './dto/update-candidature.dto';
import { UpdateOffreDto } from './dto/update-offre.dto';
import { OffresService } from './offres.service';
import {
  CandidatureWithOffre,
  OffresStatsResponse,
  OffreWithCandidaturesCount,
} from './types/recrutement.types';

@ApiTags('recrutement')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh', 'manager')
@Controller()
export class RecrutementController {
  constructor(
    private readonly offresService: OffresService,
    private readonly candidaturesService: CandidaturesService,
  ) {}

  @Get('offres/stats')
  @ApiOperation({ summary: 'Statistiques recrutement', description: 'Offres et pipeline candidatures.' })
  @ApiOkDataResponse('Statistiques offres')
  @ApiAuthResponses()
  getOffresStats(): Promise<OffresStatsResponse> {
    return this.offresService.getStats();
  }

  @Get('offres')
  @ApiOperation({ summary: 'Lister les offres d\'emploi' })
  @ApiQuery({ type: QueryOffresDto })
  @ApiOkDataResponse('Liste des offres')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllOffres(@Query() query: QueryOffresDto): Promise<OffreEmploi[]> {
    return this.offresService.findAll(query);
  }

  @Post('offres')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une offre d\'emploi' })
  @ApiBody({ type: CreateOffreDto })
  @ApiCreatedDataResponse('Offre créée')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createOffre(@Body() dto: CreateOffreDto): Promise<OffreEmploi> {
    return this.offresService.create(dto);
  }

  @Get('offres/:id')
  @ApiOperation({ summary: 'Détail d\'une offre', description: 'Inclut le nombre de candidatures.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Offre avec compteur candidatures')
  @ApiNotFoundResponse('Offre')
  @ApiAuthResponses()
  findOneOffre(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OffreWithCandidaturesCount> {
    return this.offresService.findOne(id);
  }

  @Put('offres/:id')
  @ApiOperation({ summary: 'Mettre à jour une offre' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateOffreDto })
  @ApiOkDataResponse('Offre mise à jour')
  @ApiNotFoundResponse('Offre')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateOffre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOffreDto,
  ): Promise<OffreEmploi> {
    return this.offresService.update(id, dto);
  }

  @Post('offres/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une offre d’emploi',
    description: 'Suppression logique (soft delete) des candidatures liées puis de l’offre.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Offre')
  @ApiAuthResponses()
  async removeOffre(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.offresService.remove(id);
  }

  @Get('candidatures')
  @ApiOperation({ summary: 'Lister les candidatures' })
  @ApiQuery({ type: QueryCandidaturesDto })
  @ApiOkDataResponse('Liste des candidatures')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllCandidatures(
    @Query() query: QueryCandidaturesDto,
  ): Promise<CandidatureWithOffre[]> {
    return this.candidaturesService.findAll(query);
  }

  @Post('candidatures')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer une candidature' })
  @ApiBody({ type: CreateCandidatureDto })
  @ApiCreatedDataResponse('Candidature créée')
  @ApiNotFoundResponse('Offre')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createCandidature(
    @Body() dto: CreateCandidatureDto,
  ): Promise<CandidatureWithOffre> {
    return this.candidaturesService.create(dto);
  }

  @Put('candidatures/:id')
  @ApiOperation({ summary: 'Mettre à jour une candidature', description: 'Ex. changement de statut pipeline.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateCandidatureDto })
  @ApiOkDataResponse('Candidature mise à jour')
  @ApiNotFoundResponse('Candidature')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateCandidature(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidatureDto,
  ): Promise<CandidatureWithOffre> {
    return this.candidaturesService.update(id, dto);
  }

  @Post('candidatures/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une candidature',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Candidature')
  @ApiAuthResponses()
  async removeCandidature(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.candidaturesService.remove(id);
  }
}
