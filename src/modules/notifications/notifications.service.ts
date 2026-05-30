import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Notification, Prisma, TypeNotification, UserRole } from '@prisma/client';
import { PushNotificationService } from '../push-notifications/push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPushPayload,
  buildPushPayloadFromNotification,
} from './notifications-push.util';
import { NotificationMeta } from './types/notification-meta.type';

const RH_ROLES: UserRole[] = [UserRole.admin, UserRole.rh, UserRole.manager];

interface CreateNotificationInput {
  employeId?: number;
  userId?: number;
  titre: string;
  message: string;
  type: TypeNotification;
  meta?: NotificationMeta;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async findForUser(userId: number): Promise<Notification[]> {
    const where = await this.buildRecipientWhere(userId);

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countUnreadForUser(userId: number): Promise<number> {
    const where = await this.buildRecipientWhere(userId);

    return this.prisma.notification.count({
      where: { ...where, lu: false },
    });
  }

  async markAsRead(id: number, userId: number): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    const canAccess = await this.canUserAccessNotification(userId, notification);
    if (!canAccess) {
      throw new ForbiddenException('Accès refusé à cette notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { lu: true, luAt: new Date() },
    });
  }

  async markAllAsRead(userId: number): Promise<{ updated: number }> {
    const where = await this.buildRecipientWhere(userId);

    const result = await this.prisma.notification.updateMany({
      where: { ...where, lu: false },
      data: { lu: true, luAt: new Date() },
    });

    return { updated: result.count };
  }

  async notifyEmploye(
    employeId: number,
    titre: string,
    message: string,
    type: TypeNotification,
    meta?: NotificationMeta,
  ): Promise<Notification> {
    return this.createNotification({
      employeId,
      titre,
      message,
      type,
      meta,
    });
  }

  async notifyUser(
    userId: number,
    titre: string,
    message: string,
    type: TypeNotification,
    meta?: NotificationMeta,
  ): Promise<Notification> {
    return this.createNotification({
      userId,
      titre,
      message,
      type,
      meta,
    });
  }

  /** Notifie tous les comptes admin, RH et manager. */
  async notifyRhTeam(
    titre: string,
    message: string,
    type: TypeNotification,
    meta?: NotificationMeta,
  ): Promise<number> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: RH_ROLES } },
      select: { id: true },
    });

    if (staff.length === 0) {
      return 0;
    }

    const result = await this.prisma.notification.createMany({
      data: staff.map((user) => ({
        userId: user.id,
        titre,
        message,
        type,
        meta: meta as Prisma.InputJsonValue | undefined,
      })),
    });

    const pushPayload = buildPushPayload(
      titre,
      message,
      type,
      meta,
      'user',
    );

    for (const user of staff) {
      this.dispatchPushToUser(user.id, pushPayload);
    }

    return result.count;
  }

  async safeNotifyEmploye(
    employeId: number,
    titre: string,
    message: string,
    type: TypeNotification,
    meta?: NotificationMeta,
  ): Promise<void> {
    try {
      await this.notifyEmploye(employeId, titre, message, type, meta);
    } catch (error) {
      this.logger.warn(
        `Notification employé #${employeId} non envoyée`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async safeNotifyRhTeam(
    titre: string,
    message: string,
    type: TypeNotification,
    meta?: NotificationMeta,
  ): Promise<void> {
    try {
      await this.notifyRhTeam(titre, message, type, meta);
    } catch (error) {
      this.logger.warn(
        'Notification équipe RH non envoyée',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async createNotification(
    input: CreateNotificationInput,
  ): Promise<Notification> {
    if (!input.employeId && !input.userId) {
      throw new Error('employeId ou userId requis pour une notification');
    }

    const notification = await this.prisma.notification.create({
      data: {
        employeId: input.employeId,
        userId: input.userId,
        titre: input.titre,
        message: input.message,
        type: input.type,
        meta: input.meta as Prisma.InputJsonValue | undefined,
      },
    });

    this.dispatchPushForNotification(notification, input);

    return notification;
  }

  private dispatchPushForNotification(
    notification: Notification,
    input: CreateNotificationInput,
  ): void {
    if (input.userId) {
      this.dispatchPushToUser(
        input.userId,
        buildPushPayloadFromNotification(notification, 'user'),
      );
      return;
    }

    if (input.employeId) {
      void this.resolveUserIdFromEmployeId(input.employeId)
        .then((userId) => {
          if (!userId) {
            return;
          }
          this.dispatchPushToUser(
            userId,
            buildPushPayloadFromNotification(notification, 'employe'),
          );
        })
        .catch((error) => {
          this.logger.warn(
            `Push employé #${input.employeId} non dispatché`,
            error instanceof Error ? error.message : String(error),
          );
        });
    }
  }

  private dispatchPushToUser(
    userId: number,
    payload: Parameters<PushNotificationService['sendPush']>[1],
  ): void {
    void this.pushNotificationService.sendPush(userId, payload).catch((error) => {
      this.logger.warn(
        `Push Web user #${userId} non envoyé`,
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  private async resolveUserIdFromEmployeId(
    employeId: number,
  ): Promise<number | null> {
    const employe = await this.prisma.employe.findUnique({
      where: { id: employeId },
      select: { email: true },
    });

    if (!employe?.email) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { email: employe.email },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  private async buildRecipientWhere(
    userId: number,
  ): Promise<Prisma.NotificationWhereInput> {
    const employe = await this.findEmployeByUserIdOptional(userId);
    const or: Prisma.NotificationWhereInput[] = [{ userId }];

    if (employe) {
      or.push({ employeId: employe.id });
    }

    return { OR: or };
  }

  private async canUserAccessNotification(
    userId: number,
    notification: Notification,
  ): Promise<boolean> {
    if (notification.userId === userId) {
      return true;
    }

    if (notification.employeId) {
      const employe = await this.findEmployeByUserIdOptional(userId);
      return employe?.id === notification.employeId;
    }

    return false;
  }

  private async findEmployeByUserIdOptional(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      return null;
    }

    return this.prisma.employe.findFirst({
      where: { email: user.email },
    });
  }
}
