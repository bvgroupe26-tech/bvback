import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiCreatedDataResponse,
  ApiNoContentResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/subscribe-push.dto';
import { PushNotificationService } from './push-notification.service';

@ApiTags('push')
@Controller('push')
export class PushNotificationController {
  constructor(
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Get('vapid-public-key')
  @Public()
  @ApiOperation({
    summary: 'Clé publique VAPID',
    description:
      'Clé nécessaire côté client pour PushManager.subscribe() avant enregistrement.',
  })
  @ApiOkDataResponse('Clé publique VAPID')
  getVapidPublicKey(): { publicKey: string } {
    return {
      publicKey: this.pushNotificationService.getVapidPublicKey(),
    };
  }

  @Post('subscribe')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Enregistrer une subscription Web Push',
    description:
      'Associe l\'endpoint du navigateur au compte connecté (admin ou employé).',
  })
  @ApiBody({ type: SubscribePushDto })
  @ApiCreatedDataResponse('Subscription enregistrée')
  @ApiAuthResponses()
  subscribe(
    @CurrentUser() user: UserPayload,
    @Body() dto: SubscribePushDto,
  ) {
    return this.pushNotificationService.subscribe(user.id, dto);
  }

  @Delete('unsubscribe')
  @HttpCode(204)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Désabonner une subscription Web Push',
    description: 'Retire l\'endpoint pour l\'utilisateur connecté.',
  })
  @ApiBody({ type: UnsubscribePushDto })
  @ApiNoContentResponse()
  @ApiAuthResponses()
  async unsubscribe(
    @CurrentUser() user: UserPayload,
    @Body() dto: UnsubscribePushDto,
  ): Promise<void> {
    await this.pushNotificationService.unsubscribe(user.id, dto.endpoint);
  }

  @Post('test')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Envoyer une notification push de test',
    description:
      'Envoie une alerte système sur cet appareil (app fermée possible). Utile pour valider VAPID et l’abonnement.',
  })
  @ApiOkDataResponse('Résultat envoi (sent / failed)')
  @ApiAuthResponses()
  testPush(@CurrentUser() user: UserPayload) {
    return this.pushNotificationService.sendTestPush(user.id);
  }
}
