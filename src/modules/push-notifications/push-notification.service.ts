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
import { ResubscribePushDto, SubscribePushDto } from './dto/subscribe-push.dto';
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

    const row = await this.prisma.pushSubscription.upsert({
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

    this.logger.log(
      `Push subscription enregistrée #${row.id} pour user #${userId} (${dto.endpoint.slice(0, 48)}…)`,
    );

    return row;
  }

  /**
   * Appelé par le service worker (pushsubscriptionchange) sans JWT : la possession
   * de l'ancien endpoint (URL secrète) sert de preuve, et seul son propriétaire est rattaché.
   */
  async resubscribe(dto: ResubscribePushDto): Promise<{ replaced: boolean }> {
    const previous = await this.prisma.pushSubscription.findFirst({
      where: { endpoint: dto.oldEndpoint },
      select: { id: true, userId: true },
    });

    if (!previous) {
      return { replaced: false };
    }

    if (dto.oldEndpoint !== dto.subscription.endpoint) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: previous.id },
      });
    }
    await this.subscribe(previous.userId, dto.subscription);
    return { replaced: true };
  }

  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async getDiagnosticsForUser(userId: number) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, endpoint: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      vapidConfigured: this.vapidConfigured,
      subscriptionCount: subscriptions.length,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        endpointPreview: `${s.endpoint.slice(0, 42)}…`,
        createdAt: s.createdAt,
      })),
    };
  }

  async sendTestPush(userId: number): Promise<{
    sent: number;
    failed: number;
    userId: number;
    vapidConfigured: boolean;
    subscriptionCount: number;
    message: string;
    hintApple?: string;
  }> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, deletedAt: null },
    });

    if (!this.vapidConfigured) {
      return {
        sent: 0,
        failed: 0,
        userId,
        vapidConfigured: false,
        subscriptionCount: subscriptions.length,
        message:
          'VAPID non configuré sur Render (VAPID_PRIVATE_KEY, VAPID_MAILTO).',
      };
    }

    if (subscriptions.length === 0) {
      return {
        sent: 0,
        failed: 0,
        userId,
        vapidConfigured: true,
        subscriptionCount: 0,
        message: `Aucun appareil abonné pour userId ${userId}. Ouvrez l'app → Profil → Activer les notifications (même email que ce token), puis GET /push/status.`,
      };
    }

    const result = await this.sendPush(userId, {
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

    let message: string;
    if (result.sent > 0) {
      message =
        "Envoyé vers Apple/Google. Sur iPhone : fermez l'app (swipe vers le haut), vérifiez Réglages → Notifications → BV Groupe RH.";
    } else if (result.failed > 0) {
      message =
        'Échec envoi : vérifiez que NEXT_PUBLIC_VAPID_PUBLIC_KEY (Vercel) = VAPID_PUBLIC_KEY (Render).';
    } else {
      message = 'Aucun envoi effectué.';
    }

    return {
      ...result,
      userId,
      vapidConfigured: true,
      subscriptionCount: subscriptions.length,
      message,
      hintApple:
        subscriptions.some((s) => s.endpoint.includes('web.push.apple.com')) &&
        result.sent > 0
          ? 'iOS : notification affichée par le service worker — app fermée, PWA depuis écran d\'accueil.'
          : undefined,
    };
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
          const isApple = subscription.endpoint.includes('web.push.apple.com');
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys as webPush.PushSubscription['keys'],
            },
            body,
            {
              TTL: 86_400,
              urgency: 'high',
              ...(isApple
                ? {
                    headers: {
                      'apns-push-type': 'alert',
                      'apns-priority': '10',
                    },
                  }
                : {}),
            },
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
