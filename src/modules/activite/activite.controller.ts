import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiBadRequestResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActiviteService } from './activite.service';
import { QueryActiviteDto } from './dto/query-activite.dto';
import { ActiviteLogWithEmploye } from './types/activite.types';

@ApiTags('activite')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@Controller('activite')
export class ActiviteController {
  constructor(private readonly activiteService: ActiviteService) {}

  @Get()
  @ApiOperation({
    summary: 'Journal d\'activité RH',
    description: 'Filtre optionnel par employe_id ; limite par défaut 50 (20 si employe_id).',
  })
  @ApiQuery({ type: QueryActiviteDto })
  @ApiOkDataResponse('Liste des logs d\'activité')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAll(@Query() query: QueryActiviteDto): Promise<ActiviteLogWithEmploye[]> {
    if (query.employe_id !== undefined) {
      return this.activiteService.findByEmploye(
        query.employe_id,
        query.limit ?? 20,
      );
    }

    return this.activiteService.findAll(query.limit ?? 50);
  }
}
