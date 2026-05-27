import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { NotificationsService } from './notifications.service';
import { Notification } from '@prisma/client';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Mes notifications',
    description: 'Liste des notifications de l\'employé connecté.',
  })
  @ApiOkDataResponse('Notifications de l\'employé connecté')
  @ApiAuthResponses()
  findMine(@CurrentUser() user: UserPayload): Promise<Notification[]> {
    return this.notificationsService.findByUserId(user.id);
  }

  @Put(':id/read')
  @ApiOperation({
    summary: 'Marquer comme lu',
    description: 'Marque une notification comme lue.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Notification mise à jour')
  @ApiNotFoundResponse('Notification')
  @ApiAuthResponses()
  markAsRead(@Param('id', ParseIntPipe) id: number): Promise<Notification> {
    return this.notificationsService.markAsRead(id);
  }
}
