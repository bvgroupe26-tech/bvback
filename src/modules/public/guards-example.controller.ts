import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

/** Exemples @Public() et @Roles() — routes /api/example/* */
@ApiTags('example')
@Controller('example')
export class GuardsExampleController {
  @Get('admin-only')
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Route réservée aux administrateurs',
    description: 'Nécessite JWT + rôle admin.',
  })
  @ApiOkDataResponse('Message de succès')
  @ApiAuthResponses()
  adminRoute(): { message: string } {
    return { message: 'Accès administrateur autorisé' };
  }

  @Get('public-route')
  @Public()
  @ApiOperation({
    summary: 'Route publique',
    description: 'Opt-out du guard JWT global via @Public().',
  })
  @ApiOkDataResponse('Message public')
  @ApiResponse({ status: 200, description: 'Accessible sans token' })
  publicRoute(): { message: string } {
    return { message: 'Route accessible sans authentification' };
  }
}
