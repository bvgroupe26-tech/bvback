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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateBaremeDto,
  CreateEmployeeRubriqueDto,
  CreatePayParameterDto,
  CreatePayRuleDto,
  QueryAtDateDto,
  UpdateBracketDto,
  UpdateEmployeeRubriqueDto,
  UpdateEmployeurDto,
  UpdatePayParameterDto,
  UpdatePayRuleDto,
} from './dto/paie-settings.dto';
import { PaieSettingsService } from './paie-settings.service';

@ApiTags('paie-settings')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@Controller('paie-settings')
export class PaieSettingsController {
  constructor(private readonly service: PaieSettingsService) {}

  @Get('statut')
  @ApiOperation({ summary: 'Moteur v2 prêt ? (paramètres, barèmes, mentions employeur manquants)' })
  @ApiQuery({ name: 'date', required: false, example: '2026-05-31' })
  statut(@Query() query: QueryAtDateDto) {
    return this.service.statut(query.date);
  }

  @Get('employeur')
  @ApiOperation({ summary: 'Mentions employeur du bulletin' })
  getEmployeur() {
    return this.service.getEmployeur();
  }

  @Put('employeur')
  @Roles('admin')
  updateEmployeur(@Body() dto: UpdateEmployeurDto) {
    return this.service.updateEmployeur(dto);
  }

  @Get('rubriques')
  @ApiQuery({ name: 'actif', required: false, enum: ['true', 'false'] })
  listRubriques(@Query('actif') actif?: string) {
    return this.service.listRubriques(actif === undefined ? undefined : actif === 'true');
  }

  @Post('rubriques')
  @Roles('admin')
  createRubrique(@Body() dto: CreatePayRuleDto) {
    return this.service.createRubrique(dto);
  }

  @Put('rubriques/:id')
  @Roles('admin')
  updateRubrique(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayRuleDto) {
    return this.service.updateRubrique(id, dto);
  }

  @Post('rubriques/:id/delete')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver une rubrique (conservée pour l’historique)' })
  disableRubrique(@Param('id', ParseIntPipe) id: number) {
    return this.service.disableRubrique(id);
  }

  @Get('parametres')
  @ApiOperation({ summary: 'Paramètres datés (avec ?date= : valeurs en vigueur à cette date)' })
  listParametres(@Query() query: QueryAtDateDto) {
    return this.service.listParametres(query.date, query.code);
  }

  @Post('parametres')
  @Roles('admin')
  @ApiOperation({ summary: 'Nouvelle valeur datée (clôt automatiquement la précédente)' })
  createParametre(@Body() dto: CreatePayParameterDto) {
    return this.service.createParametre(dto);
  }

  @Put('parametres/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Corriger une valeur existante' })
  updateParametre(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayParameterDto) {
    return this.service.updateParametre(id, dto);
  }

  @Get('baremes')
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'code', required: false, description: 'Code du barème (ex. IRPP)' })
  listBaremes(@Query() query: QueryAtDateDto) {
    return this.service.listBaremes(query.date, query.code);
  }

  @Post('baremes')
  @Roles('admin')
  @ApiOperation({ summary: 'Nouvelle version complète d’un barème (tranches contiguës, dernière ouverte)' })
  createBareme(@Body() dto: CreateBaremeDto) {
    return this.service.createBareme(dto);
  }

  @Put('baremes/:id')
  @Roles('admin')
  updateBracket(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBracketDto) {
    return this.service.updateBracket(id, dto);
  }

  @Post('baremes/:id/delete')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  deleteBracket(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteBracket(id);
  }

  @Get('employes/:employeId/rubriques')
  listEmployeeRubriques(@Param('employeId', ParseIntPipe) employeId: number) {
    return this.service.listEmployeeRubriques(employeId);
  }

  @Post('employes/:employeId/rubriques')
  @Roles('admin')
  createEmployeeRubrique(
    @Param('employeId', ParseIntPipe) employeId: number,
    @Body() dto: CreateEmployeeRubriqueDto,
  ) {
    return this.service.createEmployeeRubrique(employeId, dto);
  }

  @Put('employes/:employeId/rubriques/:id')
  @Roles('admin')
  updateEmployeeRubrique(
    @Param('employeId', ParseIntPipe) employeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeRubriqueDto,
  ) {
    return this.service.updateEmployeeRubrique(employeId, id, dto);
  }

  @Post('employes/:employeId/rubriques/:id/delete')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  deleteEmployeeRubrique(
    @Param('employeId', ParseIntPipe) employeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteEmployeeRubrique(employeId, id);
  }
}
