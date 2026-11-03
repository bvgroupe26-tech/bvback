import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BudgetCategorie, ParametresFinance, UserRole } from '@prisma/client';
import type { Response } from 'express';
import {
  ApiAuthResponses,
  ApiBadRequestResponse,
  ApiCreatedDataResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { CategoriesService } from './categories.service';
import { DepenseAvecAlerte, DepenseWorkflowService } from './depense-workflow.service';
import { DepensesService } from './depenses.service';
import { CreateCategorieDto } from './dto/create-categorie.dto';
import { CreateDepenseDto } from './dto/create-depense.dto';
import { CreateEnveloppeDto } from './dto/create-enveloppe.dto';
import {
  CommentaireActionDto,
  PayerDepenseDto,
  RefuserDepenseDto,
} from './dto/depense-actions.dto';
import { UpdateParametresFinanceDto } from './dto/parametres-finance.dto';
import { QueryDepensesDto } from './dto/query-depenses.dto';
import { QueryEnveloppesDto } from './dto/query-enveloppes.dto';
import { QueryExportDto } from './dto/query-export.dto';
import { QuerySyntheseDto } from './dto/query-synthese.dto';
import { UpdateCategorieDto } from './dto/update-categorie.dto';
import { UpdateDepenseDto } from './dto/update-depense.dto';
import { UpdateEnveloppeDto } from './dto/update-enveloppe.dto';
import { EnveloppesService, EnveloppeWithMontants } from './enveloppes.service';
import { BudgetExportService } from './export.service';
import { ParametresFinanceService } from './parametres-finance.service';
import { SyntheseService } from './synthese.service';
import {
  BudgetSyntheseResponse,
  DepenseDetail,
  DepensesPage,
} from './types/budget.types';

const TOUS = ['admin', 'rh', 'manager', 'employee'] as const;

const PIECE_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const PIECE_UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PIECE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Formats acceptés : PDF, JPEG, PNG (10 Mo max).'), false);
  },
};

type EnveloppeResume = Pick<
  EnveloppeWithMontants,
  'id' | 'libelle' | 'annee' | 'departement' | 'statut'
>;

@ApiTags('budget')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@Controller('budget')
export class BudgetController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly enveloppesService: EnveloppesService,
    private readonly depensesService: DepensesService,
    private readonly workflow: DepenseWorkflowService,
    private readonly syntheseService: SyntheseService,
    private readonly exportService: BudgetExportService,
    private readonly parametresService: ParametresFinanceService,
  ) {}

  // ─── Synthèse & export ──────────────────────────────────────────────────────

  @Get('synthese')
  @ApiOperation({ summary: 'Synthèse budgétaire annuelle (prévu, engagé, réalisé, disponible)' })
  @ApiQuery({ type: QuerySyntheseDto })
  @ApiOkDataResponse('Synthèse par enveloppe, catégorie, mois et fournisseur')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  getSynthese(@Query() query: QuerySyntheseDto): Promise<BudgetSyntheseResponse> {
    return this.syntheseService.getSynthese(query.annee);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export du journal des achats (dépenses payées) en CSV' })
  @ApiQuery({ type: QueryExportDto })
  @ApiResponse({ status: 200, description: 'Fichier CSV (séparateur ;, UTF-8 BOM)' })
  @ApiAuthResponses()
  async exportCsv(@Query() query: QueryExportDto, @Res() res: Response): Promise<void> {
    const csv = await this.exportService.journalAchatsCsv(query.annee);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`journal-achats-${query.annee}.csv`);
    res.send(csv);
  }

  // ─── Paramètres finance ─────────────────────────────────────────────────────

  @Get('parametres')
  @Roles(...TOUS)
  @ApiOperation({ summary: 'Paramètres finance (TVA, seuils, période close)' })
  @ApiOkDataResponse('Paramètres')
  @ApiAuthResponses()
  getParametres(): Promise<ParametresFinance> {
    return this.parametresService.get();
  }

  @Put('parametres')
  @Roles('admin')
  @ApiOperation({ summary: 'Modifier les paramètres finance (admin)' })
  @ApiBody({ type: UpdateParametresFinanceDto })
  @ApiOkDataResponse('Paramètres mis à jour')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  updateParametres(@Body() dto: UpdateParametresFinanceDto): Promise<ParametresFinance> {
    return this.parametresService.update(dto);
  }

  // ─── Catégories ─────────────────────────────────────────────────────────────

  @Get('categories')
  @Roles(...TOUS)
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
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  @ApiAuthResponses()
  createCategorie(@Body() dto: CreateCategorieDto): Promise<BudgetCategorie> {
    return this.categoriesService.create(dto);
  }

  @Get('categories/:id')
  @Roles(...TOUS)
  @ApiOperation({ summary: "Détail d'une catégorie" })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Catégorie')
  @ApiNotFoundResponse('Catégorie')
  @ApiAuthResponses()
  findOneCategorie(@Param('id', ParseIntPipe) id: number): Promise<BudgetCategorie> {
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
  @ApiOperation({ summary: 'Archiver une catégorie (refusé si utilisée)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Catégorie')
  @ApiResponse({ status: 409, description: 'Catégorie utilisée par des dépenses' })
  @ApiAuthResponses()
  async removeCategorie(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.categoriesService.remove(id);
  }

  // ─── Enveloppes ─────────────────────────────────────────────────────────────

  @Get('enveloppes')
  @Roles(...TOUS)
  @ApiOperation({
    summary: 'Lister les enveloppes budgétaires',
    description: 'Montants visibles par admin et RH ; les autres rôles reçoivent un résumé.',
  })
  @ApiQuery({ type: QueryEnveloppesDto })
  @ApiOkDataResponse('Liste des enveloppes')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  async findAllEnveloppes(
    @Query() query: QueryEnveloppesDto,
    @CurrentUser() user: UserPayload,
  ): Promise<Array<EnveloppeWithMontants | EnveloppeResume>> {
    const enveloppes = await this.enveloppesService.findAll(query);
    return this.voitMontants(user) ? enveloppes : enveloppes.map((e) => this.resume(e));
  }

  @Post('enveloppes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une enveloppe' })
  @ApiBody({ type: CreateEnveloppeDto })
  @ApiCreatedDataResponse('Enveloppe créée')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createEnveloppe(@Body() dto: CreateEnveloppeDto): Promise<EnveloppeWithMontants> {
    return this.enveloppesService.create(dto);
  }

  @Get('enveloppes/:id')
  @Roles(...TOUS)
  @ApiOperation({ summary: "Détail d'une enveloppe" })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Enveloppe')
  @ApiNotFoundResponse('Enveloppe')
  @ApiAuthResponses()
  async findOneEnveloppe(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
  ): Promise<EnveloppeWithMontants | EnveloppeResume> {
    const enveloppe = await this.enveloppesService.findOne(id);
    return this.voitMontants(user) ? enveloppe : this.resume(enveloppe);
  }

  @Put('enveloppes/:id')
  @ApiOperation({ summary: 'Mettre à jour une enveloppe' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateEnveloppeDto })
  @ApiOkDataResponse('Enveloppe mise à jour')
  @ApiNotFoundResponse('Enveloppe')
  @ApiResponse({ status: 409, description: "Changement d'exercice impossible (dépenses imputées)" })
  @ApiAuthResponses()
  updateEnveloppe(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEnveloppeDto,
  ): Promise<EnveloppeWithMontants> {
    return this.enveloppesService.update(id, dto);
  }

  @Post('enveloppes/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archiver une enveloppe sans dépense active' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Enveloppe')
  @ApiResponse({ status: 409, description: 'Des dépenses non annulées sont imputées' })
  @ApiAuthResponses()
  async removeEnveloppe(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.enveloppesService.remove(id);
  }

  // ─── Dépenses ───────────────────────────────────────────────────────────────

  @Get('depenses')
  @Roles(...TOUS)
  @ApiOperation({
    summary: 'Lister les dépenses (paginé)',
    description: 'Employé : uniquement ses dépenses. mine=1 : mes dépenses pour tous les rôles.',
  })
  @ApiQuery({ type: QueryDepensesDto })
  @ApiOkDataResponse('{ items, total, page, limit }')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAllDepenses(
    @Query() query: QueryDepensesDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepensesPage> {
    return this.depensesService.findAll(query, user);
  }

  @Post('depenses')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une dépense (brouillon)' })
  @ApiBody({ type: CreateDepenseDto })
  @ApiCreatedDataResponse('Dépense créée en brouillon')
  @ApiNotFoundResponse('Enveloppe')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createDepense(
    @Body() dto: CreateDepenseDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseDetail> {
    return this.depensesService.create(dto, user);
  }

  @Get('depenses/:id')
  @Roles(...TOUS)
  @ApiOperation({ summary: "Détail d'une dépense (pièces, historique, valideurs)" })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Dépense détaillée')
  @ApiNotFoundResponse('Dépense')
  @ApiAuthResponses()
  findOneDepense(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseDetail> {
    return this.depensesService.findOne(id, user);
  }

  @Put('depenses/:id')
  @Roles(...TOUS)
  @ApiOperation({ summary: 'Modifier un brouillon ou une dépense refusée' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateDepenseDto })
  @ApiOkDataResponse('Dépense mise à jour')
  @ApiNotFoundResponse('Dépense')
  @ApiResponse({ status: 409, description: 'Dépense non modifiable dans ce statut' })
  @ApiAuthResponses()
  updateDepense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepenseDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseDetail> {
    return this.depensesService.update(id, dto, user);
  }

  @Post('depenses/:id/delete')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un brouillon (sinon : annuler)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Dépense')
  @ApiAuthResponses()
  async removeDepense(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    await this.depensesService.remove(id, user);
  }

  @Post('depenses/:id/soumettre')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soumettre une dépense à validation' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: CommentaireActionDto, required: false })
  @ApiOkDataResponse('Dépense soumise (+ alerte de consommation)')
  @ApiResponse({ status: 409, description: 'Statut incompatible ou dépassement bloqué' })
  @ApiAuthResponses()
  soumettre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentaireActionDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseAvecAlerte> {
    return this.workflow.transition(id, 'soumettre', user, { commentaire: dto?.commentaire });
  }

  @Post('depenses/:id/valider')
  @Roles('admin', 'rh', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider (N1, ou N2 admin au-delà du seuil)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: CommentaireActionDto, required: false })
  @ApiOkDataResponse('Dépense validée')
  @ApiAuthResponses()
  valider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentaireActionDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseAvecAlerte> {
    return this.workflow.transition(id, 'valider', user, { commentaire: dto?.commentaire });
  }

  @Post('depenses/:id/refuser')
  @Roles('admin', 'rh', 'manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuser une dépense (motif obligatoire)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: RefuserDepenseDto })
  @ApiOkDataResponse('Dépense refusée')
  @ApiAuthResponses()
  refuser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefuserDepenseDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseAvecAlerte> {
    return this.workflow.transition(id, 'refuser', user, { motif: dto.motif.trim() });
  }

  @Post('depenses/:id/payer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer le paiement (RH, admin)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: PayerDepenseDto })
  @ApiOkDataResponse('Dépense payée')
  @ApiAuthResponses()
  payer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayerDepenseDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseAvecAlerte> {
    return this.workflow.transition(id, 'payer', user, { paiement: dto });
  }

  @Post('depenses/:id/annuler')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler une dépense (tracé, jamais après paiement)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: CommentaireActionDto, required: false })
  @ApiOkDataResponse('Dépense annulée')
  @ApiAuthResponses()
  annuler(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentaireActionDto,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseAvecAlerte> {
    return this.workflow.transition(id, 'annuler', user, { commentaire: dto?.commentaire });
  }

  // ─── Pièces justificatives ──────────────────────────────────────────────────

  @Post('depenses/:id/pieces')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', PIECE_UPLOAD_OPTIONS))
  @ApiOperation({ summary: 'Joindre une pièce justificative (PDF, JPEG, PNG, 10 Mo)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiCreatedDataResponse('Dépense avec ses pièces')
  @ApiAuthResponses()
  addPiece(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserPayload,
  ): Promise<DepenseDetail> {
    return this.depensesService.addPiece(id, file, user);
  }

  @Post('pieces/:id/delete')
  @Roles(...TOUS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une pièce (brouillon ou refusée uniquement)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiAuthResponses()
  async removePiece(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    await this.depensesService.removePiece(id, user);
  }

  private voitMontants(user: UserPayload): boolean {
    return user.role === UserRole.admin || user.role === UserRole.rh;
  }

  private resume(e: EnveloppeWithMontants): EnveloppeResume {
    return {
      id: e.id,
      libelle: e.libelle,
      annee: e.annee,
      departement: e.departement,
      statut: e.statut,
    };
  }
}
