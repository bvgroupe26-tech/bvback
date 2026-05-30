import { Global, Module } from '@nestjs/common';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [PushNotificationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
