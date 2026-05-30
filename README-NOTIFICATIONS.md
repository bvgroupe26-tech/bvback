# Notifications centralisées — BV Groupe RH

Les notifications sont **automatiques** côté backend et accessibles via les **mêmes routes** pour l'admin RH et la PWA employé.

---

## Routes API (communes admin + PWA)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/notifications/me` | Liste toutes mes notifications |
| `GET` | `/notifications/me/unread-count` | Badge `{ count: 3 }` |
| `PUT` | `/notifications/me/read-all` | Tout marquer comme lu |
| `PUT` | `/notifications/:id/read` | Marquer une notification |

**Auth :** JWT Bearer sur toutes les routes.

**Réponse notification :**

```json
{
  "id": 1,
  "employeId": 12,
  "userId": null,
  "titre": "Bulletin de paie disponible",
  "message": "Votre bulletin de paie 05/2026 est disponible...",
  "type": "paie",
  "meta": { "paieId": 45, "mois": "05", "annee": 2026, "statut": "paye" },
  "lu": false,
  "luAt": null,
  "createdAt": "2026-05-30T10:00:00.000Z"
}
```

| Champ | Description |
|-------|-------------|
| `employeId` | Destinataire fiche employé (PWA) |
| `userId` | Destinataire compte RH/admin/manager |
| `meta` | Lien vers l'entité (`absenceId`, `paieId`, etc.) |
| `type` | `info` \| `conge` \| `paie` \| `document` \| `systeme` |

---

## Qui reçoit quoi ?

| Événement | Destinataire | Type |
|-----------|--------------|------|
| Employé soumet une absence (`en_attente`) | **Tous** admin, RH, manager | `conge` |
| RH accepte une absence | **Employé** concerné | `conge` |
| RH refuse une absence | **Employé** concerné | `conge` |
| Génération masse des bulletins | **Chaque employé** avec bulletin créé | `paie` |
| Bulletin marqué **payé** | **Employé** concerné | `paie` |
| Création manuelle bulletin (non payé) | **Employé** concerné | `paie` |
| Création manuelle bulletin **payé** | **Employé** (message disponibilité) | `paie` |

---

## Intégration frontend

### Service unique (admin + PWA)

```typescript
// notifications.service.ts
export interface Notification {
  id: number;
  employeId: number | null;
  userId: number | null;
  titre: string;
  message: string;
  type: "info" | "conge" | "paie" | "document" | "systeme";
  meta?: Record<string, unknown> | null;
  lu: boolean;
  luAt: string | null;
  createdAt: string;
}

export const notificationsService = {
  async getMine() {
    const { data } = await api.get<{ ok: true; data: Notification[] }>(
      "/notifications/me",
    );
    return data;
  },

  async getUnreadCount() {
    const { data } = await api.get<{ ok: true; data: { count: number } }>(
      "/notifications/me/unread-count",
    );
    return data.count;
  },

  async markAsRead(id: number) {
    await api.put(`/notifications/${id}/read`);
  },

  async markAllAsRead() {
    const { data } = await api.put<{ ok: true; data: { updated: number } }>(
      "/notifications/me/read-all",
    );
    return data.updated;
  },
};
```

### Navigation depuis `meta`

```typescript
function getNotificationLink(n: Notification): string | null {
  if (n.type === "conge" && n.meta?.absenceId) {
    return `/absences/${n.meta.absenceId}`; // admin
    // return `/leaves` pour PWA
  }
  if (n.type === "paie" && n.meta?.paieId) {
    return `/paie/${n.meta.paieId}`; // admin
    // return `/payslips/${n.meta.paieId}` pour PWA
  }
  return null;
}
```

### UI recommandée

1. **Cloche** dans le header (admin + PWA) → `GET /notifications/me/unread-count`
2. **Panneau / page** liste → `GET /notifications/me`
3. Clic notification → `PUT .../read` + navigation via `meta`
4. Bouton « Tout marquer lu » → `PUT /notifications/me/read-all`

---

## Web Push (notifications système navigateur)

En plus des notifications in-app, un **push système** (style WhatsApp) est envoyé en parallèle si l'utilisateur s'est abonné.

### Routes push

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `GET` | `/push/vapid-public-key` | Publique | Clé VAPID pour `PushManager.subscribe()` |
| `POST` | `/push/subscribe` | JWT | Enregistrer une subscription navigateur |
| `DELETE` | `/push/unsubscribe` | JWT | Retirer une subscription |

### Configuration `.env`

```env
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_MAILTO="mailto:contact@bvgroupe.com"
```

Générer de nouvelles clés :

```bash
npm run vapid:generate
```

### Payload push (JSON)

```json
{
  "title": "Demande d'absence acceptée",
  "body": "Votre demande du 04/08 au 15/08...",
  "tag": "absence-12",
  "url": "/leaves",
  "icon": "/icons/icon-192.png"
}
```

### Frontend (Service Worker)

```typescript
// 1. Récupérer la clé VAPID
const { data } = await fetch('/api/push/vapid-public-key').then(r => r.json());
const publicKey = data.publicKey;

// 2. S'abonner après login
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey),
});

await api.post('/push/subscribe', subscription.toJSON());

// 3. Service worker — afficher la notification
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: data.icon,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

---

## Migration base de données

```bash
npx prisma migrate deploy
```

Migration : `20260530140000_notifications_centralisees`  
Migration push : `20260530210000_push_subscriptions`

---

## Checklist frontend

- [ ] Service `notifications.service.ts` partagé ou dupliqué admin/PWA
- [ ] Badge cloche avec polling ou refresh après actions RH
- [ ] Liste notifications avec date relative + type (icône)
- [ ] Marquer lu au clic
- [ ] Lien vers absence / bulletin selon `meta`
- [ ] Gérer `lu: false` en gras / fond accentué
