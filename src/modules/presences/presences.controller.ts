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
import { CreatePresenceDto } from './dto/create-presence.dto';
import { QueryPresencesDto } from './dto/query-presences.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { PresencesService } from './presences.service';
import {
  PresenceWithEmploye,
  PresencesStatsResponse,
} from './types/presence-with-employe.type';

@ApiTags('presences')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh', 'manager')
@Controller('presences')
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques présences', description: 'Agrégats sur les 30 derniers jours.' })
  @ApiOkDataResponse('Statistiques présences')
  @ApiAuthResponses()
  getStats(): Promise<PresencesStatsResponse> {
    return this.presencesService.getStats();
  }

  @Get('today')
  @ApiOperation({ summary: 'Présences du jour', description: 'Liste avec nom, prénom, département et poste.' })
  @ApiOkDataResponse('Présences du jour')
  @ApiQuery({ name: 'date', required: false, example: '2026-05-15' })
  @ApiAuthResponses()
  findToday(@Query('date') date?: string): Promise<PresenceWithEmploye[]> {
    const valid = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    return this.presencesService.findToday(valid);
  }

  @Get()
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ query: true })
  @ApiOperation({ summary: 'Lister les présences', description: 'Filtres par employé, date et statut.' })
  @ApiQuery({ type: QueryPresencesDto })
  @ApiOkDataResponse('Liste des présences')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAll(@Query() query: QueryPresencesDto): Promise<PresenceWithEmploye[]> {
    return this.presencesService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer une présence' })
  @ApiBody({ type: CreatePresenceDto })
  @ApiCreatedDataResponse('Présence créée')
  @ApiNotFoundResponse('Employé')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  create(@Body() dto: CreatePresenceDto): Promise<PresenceWithEmploye> {
    return this.presencesService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une présence', description: 'Mise à jour partielle.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdatePresenceDto })
  @ApiOkDataResponse('Présence mise à jour')
  @ApiNotFoundResponse('Présence')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePresenceDto,
  ): Promise<PresenceWithEmploye> {
    return this.presencesService.update(id, dto);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver une présence',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Présence')
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.presencesService.remove(id);
  }
}
