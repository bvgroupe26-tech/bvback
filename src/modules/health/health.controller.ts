import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiOkDataResponse } from '../../common/swagger/api-responses.decorator';

export interface HealthPingResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get('ping')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ping (uptime / cron / GitHub Actions)',
    description:
      'Endpoint public sans authentification. Répond 200 si l\'API est en ligne. ' +
      'Utilisable avec un cron ou `curl -f https://votre-api.onrender.com/api/health/ping`.',
  })
  @ApiOkDataResponse('API en ligne')
  ping(): HealthPingResponse {
    return {
      status: 'ok',
      service: 'bv-groupe-rh-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
