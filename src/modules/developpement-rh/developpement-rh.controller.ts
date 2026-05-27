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
import { Competence, Evaluation, Formation } from '@prisma/client';
import { CompetencesService } from './competences.service';
import { CreateCompetenceDto } from './dto/create-competence.dto';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { CreateFormationDto } from './dto/create-formation.dto';
import { QueryCompetencesDto } from './dto/query-competences.dto';
import { QueryEvaluationsDto } from './dto/query-evaluations.dto';
import { QueryFormationsDto } from './dto/query-formations.dto';
import { UpdateCompetenceDto } from './dto/update-competence.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';
import { EvaluationsService } from './evaluations.service';
import { FormationsService } from './formations.service';

@ApiTags('developpement-rh')
@ApiBearerAuth('JWT')
@Controller()
export class DeveloppementRhController {
  constructor(
    private readonly competencesService: CompetencesService,
    private readonly formationsService: FormationsService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  @Get('competences')
  @ApiOperation({ summary: 'Lister les compétences' })
  @ApiQuery({ type: QueryCompetencesDto })
  @ApiOkDataResponse('Liste des compétences')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllCompetences(
    @Query() query: QueryCompetencesDto,
  ): Promise<Competence[]> {
    return this.competencesService.findAll(query);
  }

  @Post('competences')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une compétence' })
  @ApiBody({ type: CreateCompetenceDto })
  @ApiCreatedDataResponse('Compétence créée')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createCompetence(@Body() dto: CreateCompetenceDto): Promise<Competence> {
    return this.competencesService.create(dto);
  }

  @Put('competences/:id')
  @ApiOperation({ summary: 'Mettre à jour une compétence' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateCompetenceDto })
  @ApiOkDataResponse('Compétence mise à jour')
  @ApiNotFoundResponse('Compétence')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateCompetence(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompetenceDto,
  ): Promise<Competence> {
    return this.competencesService.update(id, dto);
  }

  @Post('competences/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une compétence',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Compétence')
  @ApiAuthResponses()
  async removeCompetence(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.competencesService.remove(id);
  }

  @Get('formations')
  @ApiOperation({ summary: 'Lister les formations' })
  @ApiQuery({ type: QueryFormationsDto })
  @ApiOkDataResponse('Liste des formations')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllFormations(@Query() query: QueryFormationsDto): Promise<Formation[]> {
    return this.formationsService.findAll(query);
  }

  @Post('formations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer une formation' })
  @ApiBody({ type: CreateFormationDto })
  @ApiCreatedDataResponse('Formation créée')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createFormation(@Body() dto: CreateFormationDto): Promise<Formation> {
    return this.formationsService.create(dto);
  }

  @Put('formations/:id')
  @ApiOperation({ summary: 'Mettre à jour une formation' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateFormationDto })
  @ApiOkDataResponse('Formation mise à jour')
  @ApiNotFoundResponse('Formation')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateFormation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormationDto,
  ): Promise<Formation> {
    return this.formationsService.update(id, dto);
  }

  @Post('formations/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une formation',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Formation')
  @ApiAuthResponses()
  async removeFormation(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.formationsService.remove(id);
  }

  @Get('evaluations')
  @ApiOperation({ summary: 'Lister les évaluations' })
  @ApiQuery({ type: QueryEvaluationsDto })
  @ApiOkDataResponse('Liste des évaluations')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllEvaluations(
    @Query() query: QueryEvaluationsDto,
  ): Promise<Evaluation[]> {
    return this.evaluationsService.findAll(query);
  }

  @Post('evaluations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une évaluation',
    description: 'noteGlobale calculée automatiquement (non envoyée dans le body).',
  })
  @ApiBody({ type: CreateEvaluationDto })
  @ApiCreatedDataResponse('Évaluation créée')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createEvaluation(@Body() dto: CreateEvaluationDto): Promise<Evaluation> {
    return this.evaluationsService.create(dto);
  }

  @Post('evaluations/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une évaluation',
    description: 'Suppression logique (soft delete). Pas de route PUT.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Évaluation')
  @ApiAuthResponses()
  async removeEvaluation(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.evaluationsService.remove(id);
  }
}
