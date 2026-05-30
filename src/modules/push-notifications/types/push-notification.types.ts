export interface PushNotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  icon: string;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export const DEFAULT_PUSH_ICON = '/icons/icon-192.png';
