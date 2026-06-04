import { Notification, TypeNotification } from '@prisma/client';
import {
  DEFAULT_PUSH_ICON,
  PushNotificationPayload,
} from '../push-notifications/types/push-notification.types';
import { NotificationMeta } from './types/notification-meta.type';

type PushRecipient = 'user' | 'employe';

export function buildPushPayload(
  titre: string,
  message: string,
  type: TypeNotification,
  meta: NotificationMeta | undefined,
  recipient: PushRecipient,
  notificationId?: number,
): PushNotificationPayload {
  return {
    title: titre,
    body: message.slice(0, 100),
    tag: buildPushTag(type, meta, notificationId),
    icon: DEFAULT_PUSH_ICON,
    data: {
      url: buildPushUrl(type, meta, recipient),
      icon: DEFAULT_PUSH_ICON,
      tag: buildPushTag(type, meta, notificationId),
    },
  };
}

export function buildPushPayloadFromNotification(
  notification: Notification,
  recipient: PushRecipient,
): PushNotificationPayload {
  return buildPushPayload(
    notification.titre,
    notification.message,
    notification.type,
    (notification.meta as NotificationMeta | null) ?? undefined,
    recipient,
    notification.id,
  );
}

function buildPushTag(
  type: TypeNotification,
  meta: NotificationMeta | undefined,
  notificationId?: number,
): string {
  if (meta?.absenceId) {
    return `absence-${meta.absenceId}`;
  }
  if (meta?.paieId) {
    return `paie-${meta.paieId}`;
  }
  if (notificationId) {
    return `notif-${notificationId}`;
  }
  return `notif-${type}-${Date.now()}`;
}

function buildPushUrl(
  type: TypeNotification,
  meta: NotificationMeta | undefined,
  recipient: PushRecipient,
): string {
  if (type === TypeNotification.paie && meta?.paieId) {
    return recipient === 'employe'
      ? `/employee/paie/${meta.paieId}`
      : `/paie/${meta.paieId}`;
  }

  if (type === TypeNotification.conge && meta?.absenceId) {
    return recipient === 'employe'
      ? '/employee/leaves'
      : `/absences/${meta.absenceId}`;
  }

  if (type === TypeNotification.document) {
    return recipient === 'employe' ? '/employee/documents' : '/documents';
  }

  return recipient === 'employe' ? '/employee/notifications' : '/notifications';
}
