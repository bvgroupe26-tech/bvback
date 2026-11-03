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
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeScope } from '../../common/guards/employee-scope.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { QueryAbsencesDto } from './dto/query-absences.dto';
import { UpdateAbsenceDto } from './dto/update-absence.dto';
import { AbsencesService } from './absences.service';
import { AbsenceWithEmploye } from './types/absence-with-employe.type';

@ApiTags('absences')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh', 'manager')
@Controller('absences')
export class AbsencesController {
  constructor(private readonly absencesService: AbsencesService) {}

  @Get('me')
  @Roles('admin', 'rh', 'manager', 'employee')
  @ApiOperation({
    summary: 'Mes absences',
    description: 'Liste des absences de l\'employé connecté.',
  })
  @ApiOkDataResponse('Absences de l\'employé connecté')
  @ApiAuthResponses()
  findMine(@CurrentUser() user: UserPayload): Promise<AbsenceWithEmploye[]> {
    return this.absencesService.findByEmployeUserId(user.id);
  }

  @Get('balance/me')
  @Roles('admin', 'rh', 'manager', 'employee')
  @ApiOperation({
    summary: 'Solde congés restants',
    description: 'Calcul du solde de congés de l\'employé connecté pour l\'année en cours.',
  })
  @ApiOkDataResponse('Solde congés')
  @ApiAuthResponses()
  getBalance(@CurrentUser() user: UserPayload) {
    return this.absencesService.getBalanceByUserId(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les absences', description: 'Filtres par employé, statut, type et période.' })
  @ApiQuery({ type: QueryAbsencesDto })
  @ApiOkDataResponse('Liste des absences avec employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAll(@Query() query: QueryAbsencesDto): Promise<AbsenceWithEmploye[]> {
    return this.absencesService.findAll(query);
  }

  @Post('me')
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ body: true, staff: [] })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Demander une absence pour soi',
    description: 'Toujours sur la fiche du compte connecté (staff compris), statut en_attente.',
  })
  @ApiBody({ type: CreateAbsenceDto })
  @ApiCreatedDataResponse('Demande créée')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  createMine(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAbsenceDto,
  ): Promise<AbsenceWithEmploye> {
    return this.absencesService.createMine(user.id, dto);
  }

  @Post()
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ body: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Déclarer une absence', description: 'Statut par défaut : en_attente.' })
  @ApiBody({ type: CreateAbsenceDto })
  @ApiCreatedDataResponse('Absence créée')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAbsenceDto,
  ): Promise<AbsenceWithEmploye> {
    return this.absencesService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une absence', description: 'Validation du statut, dates, etc.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateAbsenceDto })
  @ApiOkDataResponse('Absence mise à jour')
  @ApiNotFoundResponse('Absence')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  update(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAbsenceDto,
  ): Promise<AbsenceWithEmploye> {
    return this.absencesService.update(id, dto, user.id);
  }

  @Post(':id/delete')
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ resource: 'absence' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une absence',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Absence')
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.absencesService.remove(id);
  }
}
