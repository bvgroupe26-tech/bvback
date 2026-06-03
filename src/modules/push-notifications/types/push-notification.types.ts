export interface PushNotificationPayload {
  title: string;
  body: string;
  tag: string;
  icon: string;
  /** @deprecated Préférer data.url — conservé pour compatibilité sendPush */
  url?: string;
  /** Lu par le service worker via event.data.json().data */
  data?: {
    url: string;
    icon: string;
    tag: string;
  };
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export const DEFAULT_PUSH_ICON = '/icons/icon-192.png';
