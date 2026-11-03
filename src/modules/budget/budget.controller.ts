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
import { BudgetCategorie } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { DepensesService } from './depenses.service';
import { CreateCategorieDto } from './dto/create-categorie.dto';
import { CreateDepenseDto } from './dto/create-depense.dto';
import { CreateEnveloppeDto } from './dto/create-enveloppe.dto';
import { QueryDepensesDto } from './dto/query-depenses.dto';
import { QueryEnveloppesDto } from './dto/query-enveloppes.dto';
import { QuerySyntheseDto } from './dto/query-synthese.dto';
import { UpdateCategorieDto } from './dto/update-categorie.dto';
import { UpdateDepenseDto } from './dto/update-depense.dto';
import { UpdateEnveloppeDto } from './dto/update-enveloppe.dto';
import { EnveloppesService } from './enveloppes.service';
import { SyntheseService } from './synthese.service';
import {
  BudgetSyntheseResponse,
  DepenseWithRelations,
  EnveloppeWithCount,
} from './types/budget.types';

@ApiTags('budget')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@Controller('budget')
export class BudgetController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly enveloppesService: EnveloppesService,
    private readonly depensesService: DepensesService,
    private readonly syntheseService: SyntheseService,
  ) {}

  @Get('synthese')
  @ApiOperation({ summary: 'Synthèse budgétaire annuelle', description: 'Paramètre annee requis.' })
  @ApiQuery({ type: QuerySyntheseDto })
  @ApiOkDataResponse('Synthèse par catégories et enveloppes')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  getSynthese(@Query() query: QuerySyntheseDto): Promise<BudgetSyntheseResponse> {
    return this.syntheseService.getSynthese(query.annee);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Lister les catégories budgétaires' })
  @ApiOkDataResponse('Liste des catégories')
  @ApiAuthResponses()
  findAllCategories(): Promise<BudgetCategorie[]> {
    return this.categoriesService.findAll();
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une catégorie' })
  @ApiBody({ type: CreateCategorieDto })
  @ApiCreatedDataResponse('Catégorie créée')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createCategorie(@Body() dto: CreateCategorieDto): Promise<BudgetCategorie> {
    return this.categoriesService.create(dto);
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Détail d\'une catégorie' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Catégorie')
  @ApiNotFoundResponse('Catégorie')
  @ApiAuthResponses()
  findOneCategorie(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BudgetCategorie> {
    return this.categoriesService.findOne(id);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Mettre à jour une catégorie' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateCategorieDto })
  @ApiOkDataResponse('Catégorie mise à jour')
  @ApiNotFoundResponse('Catégorie')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateCategorie(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategorieDto,
  ): Promise<BudgetCategorie> {
    return this.categoriesService.update(id, dto);
  }

  @Post('categories/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une catégorie budgétaire',
    description: 'Suppression logique (soft delete). Refusée si des dépenses actives sont liées.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Catégorie')
  @ApiResponse({ status: 409, description: 'Catégorie utilisée par des dépenses' })
  @ApiAuthResponses()
  async removeCategorie(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.categoriesService.remove(id);
  }

  @Get('enveloppes')
  @ApiOperation({ summary: 'Lister les enveloppes budgétaires' })
  @ApiQuery({ type: QueryEnveloppesDto })
  @ApiOkDataResponse('Liste des enveloppes avec nombre de dépenses')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllEnveloppes(
    @Query() query: QueryEnveloppesDto,
  ): Promise<EnveloppeWithCount[]> {
    return this.enveloppesService.findAll(query);
  }

  @Post('enveloppes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une enveloppe' })
  @ApiBody({ type: CreateEnveloppeDto })
  @ApiCreatedDataResponse('Enveloppe créée')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createEnveloppe(@Body() dto: CreateEnveloppeDto): Promise<EnveloppeWithCount> {
    return this.enveloppesService.create(dto);
  }

  @Get('enveloppes/:id')
  @ApiOperation({ summary: 'Détail d\'une enveloppe' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Enveloppe')
  @ApiNotFoundResponse('Enveloppe')
  @ApiAuthResponses()
  findOneEnveloppe(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnveloppeWithCount> {
    return this.enveloppesService.findOne(id);
  }

  @Put('enveloppes/:id')
  @ApiOperation({ summary: 'Mettre à jour une enveloppe' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateEnveloppeDto })
  @ApiOkDataResponse('Enveloppe mise à jour')
  @ApiNotFoundResponse('Enveloppe')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateEnveloppe(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEnveloppeDto,
  ): Promise<EnveloppeWithCount> {
    return this.enveloppesService.update(id, dto);
  }

  @Post('enveloppes/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une enveloppe budgétaire',
    description: 'Suppression logique (soft delete) des dépenses liées puis de l’enveloppe.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Enveloppe')
  @ApiAuthResponses()
  async removeEnveloppe(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.enveloppesService.remove(id);
  }

  @Get('depenses')
  @ApiOperation({ summary: 'Lister les dépenses' })
  @ApiQuery({ type: QueryDepensesDto })
  @ApiOkDataResponse('Liste des dépenses')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllDepenses(
    @Query() query: QueryDepensesDto,
  ): Promise<DepenseWithRelations[]> {
    return this.depensesService.findAll(query);
  }

  @Post('depenses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer une dépense' })
  @ApiBody({ type: CreateDepenseDto })
  @ApiCreatedDataResponse('Dépense créée')
  @ApiNotFoundResponse('Enveloppe')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createDepense(@Body() dto: CreateDepenseDto): Promise<DepenseWithRelations> {
    return this.depensesService.create(dto);
  }

  @Get('depenses/:id')
  @ApiOperation({ summary: 'Détail d\'une dépense' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Dépense avec enveloppe et catégorie')
  @ApiNotFoundResponse('Dépense')
  @ApiAuthResponses()
  findOneDepense(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DepenseWithRelations> {
    return this.depensesService.findOne(id);
  }

  @Put('depenses/:id')
  @ApiOperation({
    summary: 'Mettre à jour une dépense',
    description: 'Mise à jour partielle — ex. { "statut": "approuve" } seul.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateDepenseDto })
  @ApiOkDataResponse('Dépense mise à jour')
  @ApiNotFoundResponse('Dépense')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateDepense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepenseDto,
  ): Promise<DepenseWithRelations> {
    return this.depensesService.update(id, dto);
  }

  @Post('depenses/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une dépense',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Dépense')
  @ApiAuthResponses()
  async removeDepense(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.depensesService.remove(id);
  }
}
