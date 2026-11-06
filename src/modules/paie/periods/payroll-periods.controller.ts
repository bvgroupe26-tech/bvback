import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ApiAuthResponses } from '../../../common/swagger/api-responses.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../auth/types/auth.types';
import { CreatePeriodeDto, PayerPeriodeDto, RappelDto, SaveVariablesDto, ScopeEmployesDto } from './dto/periods.dto';
import { PayrollPeriodsService } from './payroll-periods.service';

/** Workflow moteur v2 : période ouverte → calculee → validee → payee → cloturee. */
@ApiTags('paie')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@ApiAuthResponses()
@Controller('paie')
export class PayrollPeriodsController {
  constructor(private readonly periods: PayrollPeriodsService) {}

  @Get('periodes')
  @ApiOperation({ summary: 'Lister les périodes de paie' })
  list() {
    return this.periods.list();
  }

  @Post('periodes')
  @ApiOperation({ summary: 'Ouvrir une période de paie' })
  @ApiResponse({ status: 409, description: 'Période déjà existante' })
  create(@Body() dto: CreatePeriodeDto) {
    return this.periods.create(dto);
  }

  @Get('periodes/:id')
  @ApiOperation({ summary: 'Détail d’une période : bulletins et compteurs' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.periods.findOne(id);
  }

  @Post('periodes/:id/calculer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculer (ou recalculer) les bulletins de la période',
    description: 'Corps optionnel { employeIds: [..] } pour ne calculer que ces employés (ex. un seul bulletin).',
  })
  @ApiResponse({ status: 422, description: 'Paramétrage incomplet : { message, codes }' })
  calculer(@Param('id', ParseIntPipe) id: number, @Body() dto: ScopeEmployesDto) {
    return this.periods.calculer(id, dto?.employeIds);
  }

  @Post('periodes/:id/valider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Valider les bulletins calculés',
    description:
      'Numéro, empreinte, snapshots, PDF archivé. Le bulletin du validateur est ignoré. Corps optionnel { employeIds: [..] } pour ne valider que ces employés.',
  })
  valider(@Param('id', ParseIntPipe) id: number, @Body() dto: ScopeEmployesDto, @CurrentUser() user: UserPayload) {
    return this.periods.valider(id, user.id, dto?.employeIds);
  }

  @Post('periodes/:id/payer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer les bulletins validés comme payés' })
  payer(@Param('id', ParseIntPipe) id: number, @Body() dto: PayerPeriodeDto, @CurrentUser() user: UserPayload) {
    return this.periods.payer(id, dto, user.id);
  }

  @Post('periodes/:id/cloturer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clôturer la période (lecture seule)' })
  cloturer(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.periods.cloturer(id, user.id);
  }

  @Get('periodes/:id/variables')
  @ApiOperation({ summary: 'Variables de la période' })
  getVariables(@Param('id', ParseIntPipe) id: number) {
    return this.periods.getVariables(id);
  }

  @Put('periodes/:id/variables')
  @ApiOperation({ summary: 'Remplacer les variables de la période' })
  saveVariables(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveVariablesDto) {
    return this.periods.saveVariables(id, dto);
  }

  @Post('periodes/:id/variables/importer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Importer heures sup et absences depuis les présences' })
  importer(@Param('id', ParseIntPipe) id: number) {
    return this.periods.importerVariables(id);
  }

  @Post(':id/contre-bulletin')
  @ApiOperation({ summary: 'Annuler un bulletin validé ou payé par contre-bulletin' })
  contreBulletin(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.periods.contreBulletin(id, user.id);
  }

  @Post(':id/rappel')
  @ApiOperation({ summary: 'Créer un rappel de salaire sur un bulletin validé ou payé' })
  rappel(@Param('id', ParseIntPipe) id: number, @Body() dto: RappelDto) {
    return this.periods.rappel(id, dto);
  }
}
