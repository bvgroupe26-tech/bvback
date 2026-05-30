# API PWA Employé — BV Groupe RH

Documentation des routes exposées par le backend NestJS pour l'application **PWA employé**.

---

## Informations générales

| Élément | Valeur |
|---------|--------|
| **URL de base** | `http://localhost:3000/api` (ou l'URL de déploiement + `/api`) |
| **Documentation Swagger** | [`/api/docs`](http://localhost:3000/api/docs) |
| **Authentification** | JWT Bearer (`Authorization: Bearer <token>`) |
| **Format succès** | `{ "ok": true, "data": ... }` |
| **Format erreur** | `{ "ok": false, "message": "...", "statusCode": ... }` |
| **Suppressions** | `POST .../:id/delete` (soft delete, pas de verbe `DELETE`) |

---

## Vue d'ensemble des routes

```
┌─────────────────────────────────────────────────────────────────┐
│  AUTH (publique + JWT)                                          │
│  POST /auth/login                                               │
│  POST /auth/logout                                              │
│  POST /auth/register-employee                                   │
│  POST /auth/refresh-token                                       │
│  GET  /auth/me                                                  │
├─────────────────────────────────────────────────────────────────┤
│  PROFIL RH                                                      │
│  GET  /employes/me                                              │
│  PUT  /employes/me                                              │
│  PUT  /employes/me/avatar                                       │
├─────────────────────────────────────────────────────────────────┤
│  ABSENCES & CONGÉS                                              │
│  GET  /absences/me                                              │
│  GET  /absences/balance/me                                      │
│  POST /absences                                                 │
│  POST /absences/:id/delete                                      │
├─────────────────────────────────────────────────────────────────┤
│  PAIE                                                           │
│  GET  /paie/me                                                  │
│  GET  /paie/:id/download                                        │
├─────────────────────────────────────────────────────────────────┤
│  DOCUMENTS RH                                                   │
│  GET  /documents/me                                             │
│  GET  /documents/:id/download                                   │
├─────────────────────────────────────────────────────────────────┤
│  NOTIFICATIONS                                                  │
│  GET  /notifications/me                                         │
│  PUT  /notifications/:id/read                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Total : 18 routes** (3 publiques, 15 protégées JWT).

---

## 1. Authentification

### `POST /api/auth/login`

Connexion de l'employé. Retourne un JWT valide **7 jours**.

| Auth | Corps |
|------|-------|
| Publique | `{ "email": "...", "password": "..." }` |

**Réponse (`data`) :**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "employe@bvgroupe.com",
    "role": "employee",
    "nom": "Mvondo",
    "prenom": "Patrick",
    "employeId": 12,
    "matricule": "BV-2025-012",
    "poste": "Responsable exploitation",
    "departement": "Exploitation",
    "avatar": "/uploads/avatars/12.jpg"
  }
}
```

---

### `POST /api/auth/logout`

Accusé de déconnexion. Le JWT étant stateless, la suppression du token se fait côté client (PWA).

| Auth |
|------|
| Publique |

**Réponse (`data`) :** `{ "ok": true }`

---

### `POST /api/auth/register-employee`

Création d'un compte **employee** + fiche RH liée. Utilisé à l'inscription depuis la PWA.

| Auth | Corps (extrait) |
|------|-----------------|
| Publique | `email`, `password` (min. 8 car.), `nom`, `prenom` + champs optionnels (`telephone`, `adresse`, `poste`, `departement`, `typeContrat`, `dateEmbauche`, `salaireBase`) |

**Réponse :** même structure que `login` (`access_token` + `user`).

---

### `POST /api/auth/refresh-token`

Génère un nouveau JWT à partir du token courant encore valide.

| Auth |
|------|
| JWT Bearer |

**Réponse :** même structure que `login`.

---

### `GET /api/auth/me`

Profil de l'utilisateur connecté (compte + infos employé si lié).

| Auth |
|------|
| JWT Bearer |

**Réponse (`data`) :** objet `UserMePayload` (id, email, role, nom, prenom, employeId, matricule, poste, departement, avatar…).

---

## 2. Fiche employé (profil RH)

Routes réservées à l'employé connecté (résolution par `user.id` → fiche RH).

### `GET /api/employes/me`

Récupère la fiche RH complète de l'employé connecté.

| Auth |
|------|
| JWT Bearer |

---

### `PUT /api/employes/me`

Mise à jour partielle de la fiche (ex. téléphone, adresse).

| Auth | Corps |
|------|-------|
| JWT Bearer | Champs partiels de la fiche employé |

---

### `PUT /api/employes/me/avatar`

Upload ou remplacement de la photo de profil.

| Auth | Content-Type | Corps |
|------|--------------|-------|
| JWT Bearer | `multipart/form-data` | champ fichier `avatar` |

---

## 3. Absences & congés

### `GET /api/absences/me`

Liste toutes les demandes d'absence de l'employé connecté.

| Auth |
|------|
| JWT Bearer |

---

### `GET /api/absences/balance/me`

Solde de congés pour l'année en cours.

| Auth |
|------|
| JWT Bearer |

**Réponse (`data`) — exemple :**

```json
{
  "annee": 2026,
  "droitAnnuel": 30,
  "joursPris": 5,
  "soldeRestant": 25,
  "detailParType": { "conge_paye": 5 },
  "total": 30,
  "pris": 5,
  "restant": 25,
  "en_attente": 3
}
```

| Champ | Description |
|-------|-------------|
| `droitAnnuel` / `total` | Droit annuel (30 jours) |
| `pris` | Congés payés approuvés consommés |
| `restant` / `soldeRestant` | Solde restant sur congés payés |
| `en_attente` | Jours en demandes `en_attente` |
| `joursPris` | Total jours approuvés (tous types) |

---

### `POST /api/absences`

Soumet une nouvelle demande d'absence. Statut par défaut : `en_attente`.

| Auth | Corps |
|------|-------|
| JWT Bearer | Voir ci-dessous |

**Corps :**

```json
{
  "employeId": 12,
  "dateDebut": "2026-08-04",
  "dateFin": "2026-08-15",
  "typeAbsence": "conge_paye",
  "justification": "Congés annuels"
}
```

**Types d'absence (`typeAbsence`) :**

| Valeur | Description |
|--------|-------------|
| `conge_paye` | Congé payé |
| `maladie` | Maladie |
| `conge_sans_solde` | Congé sans solde |
| `maternite` | Maternité |
| `paternite` | Paternité |
| `autre` | Autre |

**Statuts (`statut`) :** `en_attente` · `approuve` · `refuse` (géré par la RH côté admin).

---

### `POST /api/absences/:id/delete`

Annule / archive une demande d'absence (soft delete). Utilisé par la PWA pour annuler une demande en attente.

| Auth | Paramètre |
|------|-----------|
| JWT Bearer | `id` — identifiant de l'absence |

**Réponse :** `204 No Content` (hors enveloppe `{ ok, data }`).

---

## 4. Bulletins de paie

### `GET /api/paie/me`

Liste les bulletins de l'employé connecté.

> Seuls les bulletins au statut **`paye`** sont retournés (les bulletins `en_attente` ne sont pas visibles côté PWA).

| Auth |
|------|
| JWT Bearer |

---

### `GET /api/paie/:id/download`

Télécharge le fichier d'un bulletin (stream binaire).

| Auth | Paramètre |
|------|-----------|
| JWT Bearer | `id` — identifiant du bulletin |

**Headers réponse :** `Content-Disposition: attachment; filename="..."`

---

## 5. Documents RH

### `GET /api/documents/me`

Liste les documents RH disponibles pour l'employé connecté (contrats, attestations, etc.).

| Auth |
|------|
| JWT Bearer |

---

### `GET /api/documents/:id/download`

Télécharge un document RH.

| Auth | Paramètre |
|------|-----------|
| JWT Bearer | `id` — identifiant du document |

**Headers réponse :** `Content-Disposition: attachment; filename="..."`

---

## 6. Notifications

### `GET /api/notifications/me`

Liste les notifications destinées à l'employé connecté.

| Auth |
|------|
| JWT Bearer |

---

### `PUT /api/notifications/:id/read`

Marque une notification comme lue.

| Auth | Paramètre |
|------|-----------|
| JWT Bearer | `id` — identifiant de la notification |

**Réponse (`data`) :** objet notification mis à jour.

---

## Tableau récapitulatif

| # | Méthode | Route | Auth | Usage PWA |
|---|---------|-------|------|-----------|
| 1 | `POST` | `/auth/login` | Publique | Connexion |
| 2 | `POST` | `/auth/logout` | Publique | Déconnexion |
| 3 | `POST` | `/auth/register-employee` | Publique | Inscription employé |
| 4 | `POST` | `/auth/refresh-token` | JWT | Renouveler le token |
| 5 | `GET` | `/auth/me` | JWT | Profil session |
| 6 | `GET` | `/employes/me` | JWT | Fiche RH |
| 7 | `PUT` | `/employes/me` | JWT | Modifier profil |
| 8 | `PUT` | `/employes/me/avatar` | JWT | Photo de profil |
| 9 | `GET` | `/absences/me` | JWT | Mes absences |
| 10 | `GET` | `/absences/balance/me` | JWT | Solde congés |
| 11 | `POST` | `/absences` | JWT | Nouvelle demande |
| 12 | `POST` | `/absences/:id/delete` | JWT | Annuler demande |
| 13 | `GET` | `/paie/me` | JWT | Mes bulletins (payés) |
| 14 | `GET` | `/paie/:id/download` | JWT | Télécharger bulletin |
| 15 | `GET` | `/documents/me` | JWT | Mes documents |
| 16 | `GET` | `/documents/:id/download` | JWT | Télécharger document |
| 17 | `GET` | `/notifications/me` | JWT | Mes notifications |
| 18 | `PUT` | `/notifications/:id/read` | JWT | Marquer comme lu |

---

## Exemple d'appel (curl)

```bash
# 1. Connexion
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"employe@bvgroupe.com","password":"MotDePasse2026!"}'

# 2. Profil employé (remplacer TOKEN)
curl http://localhost:3000/api/employes/me \
  -H "Authorization: Bearer TOKEN"

# 3. Solde congés
curl http://localhost:3000/api/absences/balance/me \
  -H "Authorization: Bearer TOKEN"
```

---

## Routes hors périmètre PWA

Les endpoints suivants existent dans l'API mais sont destinés à l'**administration RH** (pas à la PWA employé) :

- `GET /employes`, `GET /employes/stats`, `GET /employes/:id`
- `GET /absences` (liste globale), `PUT /absences/:id`
- `GET /paie`, `GET /paie/stats`, `POST /paie`, etc.
- `GET /users/*` (réservé rôle `admin`)
- Dashboard, budget, recrutement, présences, etc.

La PWA employé ne consomme que les routes listées dans ce document.

---

## Démarrage local

```bash
cp .env.example .env
# Renseigner DATABASE_URL, AUTH_SECRET, etc.

npm install
npm run prisma:migrate
npm run start:dev
```

API : `http://localhost:3000/api`  
Swagger : `http://localhost:3000/api/docs`
