import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from '@prisma/client';
import { Prisma } from '@prisma/client';
import * as webPush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import {
  DEFAULT_PUSH_ICON,
  PushNotificationPayload,
} from './types/push-notification.types';

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private vapidConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const mailto = this.config.get<string>('VAPID_MAILTO');

    if (!publicKey || !privateKey || !mailto) {
      this.logger.warn(
        'VAPID non configuré (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_MAILTO) — push Web désactivé',
      );
      return;
    }

    webPush.setVapidDetails(mailto, publicKey, privateKey);
    this.vapidConfigured = true;
    this.logger.log('Web Push VAPID configuré');
  }

  getVapidPublicKey(): string {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey) {
      throw new ServiceUnavailableException(
        'VAPID_PUBLIC_KEY non configurée sur le serveur',
      );
    }
    return publicKey;
  }

  async subscribe(
    userId: number,
    dto: SubscribePushDto,
  ): Promise<PushSubscription> {
    const keysJson = {
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    } satisfies Prisma.InputJsonObject;

    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        keys: keysJson,
      },
      update: {
        userId,
        keys: keysJson,
        deletedAt: null,
      },
    });
  }

  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async sendTestPush(userId: number): Promise<{ sent: number; failed: number }> {
    return this.sendPush(userId, {
      title: 'BV Groupe RH — Test',
      body: 'Notification test : les alertes hors application fonctionnent.',
      tag: 'bv-push-test',
      icon: DEFAULT_PUSH_ICON,
      data: {
        url: '/employee/notifications',
        icon: DEFAULT_PUSH_ICON,
        tag: 'bv-push-test',
      },
    });
  }

  async sendPush(
    userId: number,
    payload: PushNotificationPayload,
  ): Promise<{ sent: number; failed: number }> {
    if (!this.vapidConfigured) {
      this.logger.warn(
        `Push non envoyé pour user #${userId} : VAPID non configuré sur le serveur`,
      );
      return { sent: 0, failed: 0 };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, deletedAt: null },
    });

    if (subscriptions.length === 0) {
      this.logger.warn(
        `Push non envoyé pour user #${userId} : aucun appareil abonné (POST /push/subscribe)`,
      );
      return { sent: 0, failed: 0 };
    }

    const frontendBase =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') || '';
    const payloadData = (payload as PushNotificationPayload & {
      data?: { url?: string; icon?: string; tag?: string };
    }).data;
    const pushUrl = payloadData?.url ?? payload.url ?? '/notifications';
    const iconPath =
      payloadData?.icon ?? payload.icon ?? DEFAULT_PUSH_ICON;
    const icon =
      iconPath.startsWith('http://') || iconPath.startsWith('https://')
        ? iconPath
        : `${frontendBase}${iconPath.startsWith('/') ? iconPath : `/${iconPath}`}`;

    const normalized = {
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: pushUrl,
      icon: icon || DEFAULT_PUSH_ICON,
      data: {
        url: pushUrl,
        icon: icon || DEFAULT_PUSH_ICON,
        tag: payloadData?.tag ?? payload.tag,
      },
    };

    const body = JSON.stringify(normalized);
    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys as webPush.PushSubscription['keys'],
            },
            body,
          );
          sent++;
        } catch (error) {
          failed++;
          await this.handlePushError(subscription.id, error);
        }
      }),
    );

    if (sent > 0) {
      this.logger.log(
        `Push envoyé user #${userId} : ${sent} ok, ${failed} échec(s)`,
      );
    } else if (failed > 0) {
      this.logger.warn(
        `Push échoué user #${userId} : ${failed} échec(s) — vérifier clés VAPID (publique Vercel = publique Render)`,
      );
    }

    return { sent, failed };
  }

  private async handlePushError(
    subscriptionId: number,
    error: unknown,
  ): Promise<void> {
    const statusCode =
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as { statusCode: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 410 || statusCode === 404) {
      try {
        await this.prisma.pushSubscription.delete({
          where: { id: subscriptionId },
        });
        this.logger.debug(
          `Subscription push #${subscriptionId} supprimée (expirée ${statusCode})`,
        );
      } catch {
        // déjà supprimée
      }
      return;
    }

    this.logger.warn(
      `Échec envoi push subscription #${subscriptionId}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
