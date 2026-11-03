import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { DashboardService } from './dashboard.service';
import {
  ActiviteRecente,
  DashboardStatsResponse,
  DepartementStats,
  EmployeeDashboardResponse,
  PresencesChartDay,
  RecrutementPipeline,
} from './types/dashboard.types';

@ApiTags('dashboard')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh', 'manager')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('me')
  @Roles('admin', 'rh', 'manager', 'employee')
  @ApiOperation({
    summary: 'Résumé employé',
    description: 'Solde congés, dernière paie et notifications non lues de l\'employé connecté.',
  })
  @ApiOkDataResponse('Résumé personnel')
  @ApiAuthResponses()
  getMyDashboard(@CurrentUser() user: UserPayload): Promise<EmployeeDashboardResponse> {
    return this.dashboardService.getEmployeeDashboard(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques tableau de bord', description: 'Vue consolidée RH.' })
  @ApiOkDataResponse('Indicateurs clés')
  @ApiAuthResponses()
  getStats(): Promise<DashboardStatsResponse> {
    return this.dashboardService.getStats();
  }

  @Get('presences-chart')
  @ApiOperation({ summary: 'Graphique présences', description: '30 derniers jours.' })
  @ApiOkDataResponse('Série journalière')
  @ApiAuthResponses()
  getPresencesChart(): Promise<PresencesChartDay[]> {
    return this.dashboardService.getPresencesChart();
  }

  @Get('departements')
  @ApiOperation({ summary: 'Stats par département' })
  @ApiOkDataResponse('Répartition départements')
  @ApiAuthResponses()
  getDepartements(): Promise<DepartementStats[]> {
    return this.dashboardService.getDepartements();
  }

  @Get('activite')
  @ApiOperation({ summary: 'Activité récente', description: '10 dernières entrées du journal.' })
  @ApiOkDataResponse('Activités récentes')
  @ApiAuthResponses()
  getActivite(): Promise<ActiviteRecente[]> {
    return this.dashboardService.getActiviteRecente();
  }

  @Get('recrutements')
  @ApiOperation({ summary: 'Pipeline recrutement', description: 'Candidatures par statut.' })
  @ApiOkDataResponse('Pipeline')
  @ApiAuthResponses()
  getRecrutements(): Promise<RecrutementPipeline> {
    return this.dashboardService.getRecrutementsPipeline();
  }
}
