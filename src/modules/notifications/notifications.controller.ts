import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
    description:
      'Liste centralisée : notifications adressées au compte (RH/admin) ou à la fiche employé liée (PWA).',
  })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkDataResponse('Notifications du compte connecté')
  @ApiAuthResponses()
  findMine(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Notification[]> {
    return this.notificationsService.findForUser(user.id, {
      limit: toPositiveInt(limit),
      offset: toPositiveInt(offset),
    });
  }

  @Get('me/unread-count')
  @ApiOperation({
    summary: 'Nombre de notifications non lues',
    description: 'Compteur pour badge cloche (admin et employé).',
  })
  @ApiOkDataResponse('Nombre de notifications non lues')
  @ApiAuthResponses()
  countUnread(
    @CurrentUser() user: UserPayload,
  ): Promise<{ count: number }> {
    return this.notificationsService
      .countUnreadForUser(user.id)
      .then((count) => ({ count }));
  }

  @Put('me/read-all')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Tout marquer comme lu',
    description: 'Marque toutes les notifications du compte connecté comme lues.',
  })
  @ApiOkDataResponse('Nombre de notifications mises à jour')
  @ApiAuthResponses()
  markAllAsRead(
    @CurrentUser() user: UserPayload,
  ): Promise<{ updated: number }> {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Put(':id/read')
  @ApiOperation({
    summary: 'Marquer comme lu',
    description: 'Marque une notification comme lue (uniquement les siennes).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Notification mise à jour')
  @ApiNotFoundResponse('Notification')
  @ApiAuthResponses()
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserPayload,
  ): Promise<Notification> {
    return this.notificationsService.markAsRead(id, user.id);
  }
}

function toPositiveInt(value?: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
