import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { DashboardService } from './dashboard.service';
import { StatistiquesSyntheseResponse } from './types/dashboard.types';

@ApiTags('statistiques')
@ApiBearerAuth('JWT')
@Controller('statistiques')
export class StatistiquesController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('synthese')
  @ApiOperation({
    summary: 'Synthèse globale RH',
    description: 'Indicateurs transverses employés, paie, recrutement, budget.',
  })
  @ApiOkDataResponse('Synthèse statistiques')
  @ApiAuthResponses()
  getSynthese(): Promise<StatistiquesSyntheseResponse> {
    return this.dashboardService.getSynthese();
  }
}
