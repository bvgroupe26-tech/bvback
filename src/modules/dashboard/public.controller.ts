import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiOkDataResponse } from '../../common/swagger/api-responses.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DashboardService } from './dashboard.service';
import {
  PresencesChartDay,
  PublicStatsResponse,
} from './types/dashboard.types';

@ApiTags('public')
@Controller('public')
@Public()
export class DashboardPublicController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Statistiques publiques',
    description: 'Version anonymisée — accessible sans JWT.',
  })
  @ApiOkDataResponse('Statistiques publiques')
  @ApiResponse({ status: 200, description: 'Données agrégées sans informations sensibles' })
  getStats(): Promise<PublicStatsResponse> {
    return this.dashboardService.getPublicStats();
  }

  @Get('presences-chart')
  @ApiOperation({
    summary: 'Graphique présences public',
    description: '30 derniers jours — sans authentification.',
  })
  @ApiOkDataResponse('Série journalière publique')
  getPresencesChart(): Promise<PresencesChartDay[]> {
    return this.dashboardService.getPresencesChart();
  }
}
