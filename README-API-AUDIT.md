# Audit API — BV Groupe RH

Inventaire **complet** des routes exposées par le backend NestJS, pour vérification côté **frontend admin** et **PWA employé**.

| | |
|---|---|
| **Base URL** | `http://localhost:3000/api` |
| **Swagger** | `/api/docs` |
| **Total routes** | **99** |

---

## Conventions API

### Authentification

| Symbole | Signification |
|---------|---------------|
| 🌐 | Publique (sans JWT) |
| 🔒 | JWT Bearer requis |
| 👑 | JWT + rôle **`admin`** uniquement |

Rôles possibles : `admin` · `manager` · `rh` · `employee`

> Seul le module **`/users`** impose le rôle `admin`. Toutes les autres routes 🔒 acceptent **tout rôle authentifié** (y compris `employee`).

### Format des réponses

**Succès JSON** (majorité des routes) :

```json
{ "ok": true, "data": { ... } }
```

**Erreur JSON** :

```json
{ "ok": false, "error": "Message d'erreur" }
```

**Exceptions (pas d'enveloppe `{ ok, data }`)** :

| Type | Code HTTP | Exemple |
|------|-----------|---------|
| Téléchargement fichier | 200 | `GET /paie/:id/download`, `GET /documents/:id/download` |
| Suppression logique | 204 | `POST .../:id/delete` (corps vide) |

### Corps de requête

- **camelCase** ou **snake_case** acceptés en entrée (conversion automatique snake → camel).
- Les **query params** utilisent souvent le **snake_case** (`employe_id`, `type_contrat`, `date_from`).

### Suppressions

Pas de verbe `DELETE`. Toujours : **`POST /resource/:id/delete`**

---

## Légende application cible

| Cible | Description |
|-------|-------------|
| **ADMIN** | Application RH / back-office |
| **PWA** | Application employé |
| **PUBLIC** | Sans authentification |
| **ADMIN+PWA** | Les deux (routes `/me`) |

---

## 1. Auth — `/api/auth` (6 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 1 | `POST` | `/auth/login` | 🌐 | ADMIN+PWA | Connexion → `{ access_token, user }` |
| 2 | `POST` | `/auth/logout` | 🌐 | ADMIN+PWA | Accusé déconnexion |
| 3 | `POST` | `/auth/register` | 🌐 | ADMIN | Inscription RH/manager (pas admin) |
| 4 | `POST` | `/auth/register-employee` | 🌐 | PWA | Inscription employé + fiche RH |
| 5 | `POST` | `/auth/refresh-token` | 🔒 | ADMIN+PWA | Nouveau JWT |
| 6 | `GET` | `/auth/me` | 🔒 | ADMIN+PWA | Profil session (+ employeId, matricule…) |

**Body login :**

```json
{ "email": "...", "password": "..." }
```

**Réponse login / refresh :**

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJ...",
    "user": {
      "id": 1,
      "email": "...",
      "role": "employee",
      "nom": "...",
      "prenom": "...",
      "employeId": 12,
      "matricule": "EMP-000012",
      "poste": "...",
      "departement": "...",
      "avatar": "..."
    }
  }
}
```

---

## 2. Users — `/api/users` (5 routes) 👑

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 7 | `GET` | `/users` | 👑 | ADMIN | Liste comptes |
| 8 | `GET` | `/users/:id` | 👑 | ADMIN | Détail compte |
| 9 | `POST` | `/users` | 👑 | ADMIN | Créer compte |
| 10 | `PUT` | `/users/:id` | 👑 | ADMIN | Modifier compte |
| 11 | `POST` | `/users/:id/delete` | 👑 | ADMIN | Archiver compte → 204 |

**Body POST :** `{ email, password, nom, prenom, role }` — rôles : `admin` \| `manager` \| `rh` \| `employee`

---

## 3. Employés — `/api/employes` (10 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 12 | `GET` | `/employes/stats` | 🔒 | ADMIN | Stats effectifs |
| 13 | `GET` | `/employes` | 🔒 | ADMIN | Liste + filtres |
| 14 | `POST` | `/employes` | 🔒 | ADMIN | Créer fiche RH |
| 15 | `GET` | `/employes/me` | 🔒 | PWA | Ma fiche RH |
| 16 | `PUT` | `/employes/me` | 🔒 | PWA | Modifier ma fiche |
| 17 | `PUT` | `/employes/me/avatar` | 🔒 | PWA | Upload avatar (`multipart`, champ `avatar`) |
| 18 | `GET` | `/employes/:id` | 🔒 | ADMIN | Détail employé |
| 19 | `PUT` | `/employes/:id` | 🔒 | ADMIN | Modifier employé |
| 20 | `PUT` | `/employes/:id/avatar` | 🔒 | ADMIN | Upload avatar admin |
| 21 | `POST` | `/employes/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query `GET /employes` :**

| Param | Type | Exemple |
|-------|------|---------|
| `search` | string | `Mvondo` |
| `departement` | string | `RH` |
| `type_contrat` | enum | `CDI`, `CDD`, `Stage`, `Freelance`, `Interim` |
| `statut` | enum | `actif`, `inactif`, `suspendu` |
| `sort` | enum | `nom`, `date_embauche`, `salaire_base`, `recent` |
| `limit` | number | `50` |

**Champs clés fiche employé (réponse) :**

```typescript
{
  id, matricule, nom, prenom, email, telephone, adresse, avatar,
  dateNaissance, situationFamiliale, nombreEnfants,
  typeContrat, poste, departement,
  dateEmbauche, dateFinContrat,   // dateFinContrat = NOUVEAU
  statut, salaireBase,
  defPrimeTransport, defPrimeLogement, defPrimePerformance, defAutresPrimes,
  defTauxCnss, defTauxImpot,
  createdAt, updatedAt
}
```

---

## 4. Présences — `/api/presences` (6 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 22 | `GET` | `/presences/stats` | 🔒 | ADMIN | Stats du jour / période |
| 23 | `GET` | `/presences/today` | 🔒 | ADMIN | Présences du jour |
| 24 | `GET` | `/presences` | 🔒 | ADMIN | Liste + filtres |
| 25 | `POST` | `/presences` | 🔒 | ADMIN | Créer pointage |
| 26 | `PUT` | `/presences/:id` | 🔒 | ADMIN | Modifier |
| 27 | `POST` | `/presences/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query `GET /presences` :** `date`, `employe_id`, `statut`, `date_from`, `date_to`, `limit`

**Statuts présence :** `present`, `absent`, `retard`, `conge`, `mission`

---

## 5. Absences — `/api/absences` (6 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 28 | `GET` | `/absences/me` | 🔒 | PWA | Mes absences |
| 29 | `GET` | `/absences/balance/me` | 🔒 | PWA | Solde congés |
| 30 | `GET` | `/absences` | 🔒 | ADMIN | Liste globale |
| 31 | `POST` | `/absences` | 🔒 | ADMIN+PWA | Créer demande |
| 32 | `PUT` | `/absences/:id` | 🔒 | ADMIN | Valider / modifier statut |
| 33 | `POST` | `/absences/:id/delete` | 🔒 | ADMIN+PWA | Annuler → 204 |

**Query `GET /absences` :** `employe_id`, `statut`, `type_absence`, `date_from`, `date_to`

**Body POST :**

```json
{
  "employeId": 12,
  "dateDebut": "2026-08-04",
  "dateFin": "2026-08-15",
  "typeAbsence": "conge_paye",
  "justification": "..."
}
```

**Types absence :** `maladie`, `conge_paye`, `conge_sans_solde`, `maternite`, `paternite`, `autre`

**Statuts :** `en_attente`, `approuve`, `refuse`

**Réponse `GET /absences/balance/me` :**

```json
{
  "ok": true,
  "data": {
    "annee": 2026,
    "droitAnnuel": 30,
    "joursPris": 5,
    "soldeRestant": 25,
    "total": 30,
    "pris": 5,
    "restant": 25,
    "en_attente": 3,
    "detailParType": { "conge_paye": 5 }
  }
}
```

---

## 6. Paie — `/api/paie` (10 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 34 | `GET` | `/paie/stats` | 🔒 | ADMIN | Stats masse salariale |
| 35 | `GET` | `/paie/evolution` | 🔒 | ADMIN | Évolution 12 mois |
| 36 | `GET` | `/paie/me` | 🔒 | PWA | Mes bulletins (**payés** uniquement) |
| 37 | `GET` | `/paie` | 🔒 | ADMIN | Liste bulletins |
| 38 | `POST` | `/paie` | 🔒 | ADMIN | Créer **ou** générer en masse |
| 39 | `GET` | `/paie/:id/download` | 🔒 | ADMIN+PWA | Télécharger bulletin (fichier brut) |
| 40 | `GET` | `/paie/:id` | 🔒 | ADMIN | Détail bulletin |
| 41 | `PUT` | `/paie/:id` | 🔒 | ADMIN | Modifier / marquer payé |
| 42 | `POST` | `/paie/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query `GET /paie` :** `mois`, `annee`, `statut`, `employe_id`

**Statuts paie :** `en_attente`, `paye`, `annule`

### Mode génération masse — `POST /paie`

```json
{ "mois": "05", "annee": 2026 }
```

**Réponse :**

```json
{
  "ok": true,
  "data": {
    "generated": 12,
    "skipped": 5,
    "summary": {
      "deja_existant": 1,
      "statut_inactif": 2,
      "statut_suspendu": 1,
      "non_embauche": 0,
      "depart_avant_periode": 1,
      "salaire_zero": 0
    },
    "skippedDetails": [
      {
        "employeId": 8,
        "nom": "Dupont",
        "prenom": "Marie",
        "reason": "statut_suspendu",
        "message": "Employé suspendu — bulletin non généré automatiquement"
      }
    ],
    "bulletins": [ /* ... */ ]
  }
}
```

### Mode manuel — `POST /paie`

Corps complet avec `employeId`, montants, `mois`, `annee`, `statut` optionnel.

Erreur **400** si employé non éligible (suspendu, hors période, etc.).

### Champs bulletin (réponse)

```typescript
{
  id, employeId, mois, annee,
  salaireBase, primeTransport, primeLogement, primePerformance, autresPrimes,
  cnss, impot, autresRetenues, salaireNet,
  statut, datePaiement,
  joursTravailles,   // NOUVEAU — prorata
  joursPeriode,      // NOUVEAU — prorata
  employe?: { nom, prenom, poste, departement }
}
```

---

## 7. Recrutement — `/api` (11 routes)

### Offres d'emploi

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 43 | `GET` | `/offres/stats` | 🔒 | ADMIN | Stats vivier |
| 44 | `GET` | `/offres` | 🔒 | ADMIN | Liste offres |
| 45 | `POST` | `/offres` | 🔒 | ADMIN | Créer offre |
| 46 | `GET` | `/offres/:id` | 🔒 | ADMIN | Détail offre |
| 47 | `PUT` | `/offres/:id` | 🔒 | ADMIN | Modifier |
| 48 | `POST` | `/offres/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query `GET /offres` :** `statut`, `type_contrat`, `departement`

**Statuts offre :** `ouverte`, `fermee`, `pourvue`

### Candidatures

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 49 | `GET` | `/candidatures` | 🔒 | ADMIN | Liste |
| 50 | `POST` | `/candidatures` | 🔒 | ADMIN | Créer |
| 51 | `PUT` | `/candidatures/:id` | 🔒 | ADMIN | Modifier statut pipeline |
| 52 | `POST` | `/candidatures/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query `GET /candidatures` :** `offre_id`, `statut`, `search`

**Statuts candidature :** `recu`, `en_cours`, `retenu`, `rejete`

---

## 8. Développement RH — `/api` (11 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 53 | `GET` | `/competences` | 🔒 | ADMIN | Liste |
| 54 | `POST` | `/competences` | 🔒 | ADMIN | Créer |
| 55 | `PUT` | `/competences/:id` | 🔒 | ADMIN | Modifier |
| 56 | `POST` | `/competences/:id/delete` | 🔒 | ADMIN | Archiver → 204 |
| 57 | `GET` | `/formations` | 🔒 | ADMIN | Liste |
| 58 | `POST` | `/formations` | 🔒 | ADMIN | Créer |
| 59 | `PUT` | `/formations/:id` | 🔒 | ADMIN | Modifier |
| 60 | `POST` | `/formations/:id/delete` | 🔒 | ADMIN | Archiver → 204 |
| 61 | `GET` | `/evaluations` | 🔒 | ADMIN | Liste |
| 62 | `POST` | `/evaluations` | 🔒 | ADMIN | Créer |
| 63 | `POST` | `/evaluations/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Query compétences :** `employe_id`, `niveau`, `limit`

**Query formations :** `employe_id`, `type`, `limit`

**Query évaluations :** `employe_id`, `limit`

**Niveaux compétence :** `debutant`, `intermediaire`, `avance`, `expert`

**Types formation :** `formation`, `certification`, `diplome`

---

## 9. Dashboard — `/api/dashboard` (6 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 64 | `GET` | `/dashboard/me` | 🔒 | ADMIN | Dashboard personnalisé |
| 65 | `GET` | `/dashboard/stats` | 🔒 | ADMIN | KPI globaux |
| 66 | `GET` | `/dashboard/presences-chart` | 🔒 | ADMIN | Graphique présences |
| 67 | `GET` | `/dashboard/departements` | 🔒 | ADMIN | Répartition départements |
| 68 | `GET` | `/dashboard/activite` | 🔒 | ADMIN | Flux activité récent |
| 69 | `GET` | `/dashboard/recrutements` | 🔒 | ADMIN | Pipeline recrutement |

---

## 10. Statistiques — `/api/statistiques` (1 route)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 70 | `GET` | `/statistiques/synthese` | 🔒 | ADMIN | Synthèse globale RH |

---

## 11. Public — `/api/public` (2 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 71 | `GET` | `/public/stats` | 🌐 | PUBLIC | Stats agrégées (site vitrine) |
| 72 | `GET` | `/public/presences-chart` | 🌐 | PUBLIC | Graphique présences public |

---

## 12. Budget — `/api/budget` (16 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 73 | `GET` | `/budget/synthese` | 🔒 | ADMIN | Synthèse annuelle — query **`annee`** obligatoire |
| 74 | `GET` | `/budget/categories` | 🔒 | ADMIN | Liste catégories |
| 75 | `POST` | `/budget/categories` | 🔒 | ADMIN | Créer catégorie |
| 76 | `GET` | `/budget/categories/:id` | 🔒 | ADMIN | Détail |
| 77 | `PUT` | `/budget/categories/:id` | 🔒 | ADMIN | Modifier |
| 78 | `POST` | `/budget/categories/:id/delete` | 🔒 | ADMIN | Archiver → 204 |
| 79 | `GET` | `/budget/enveloppes` | 🔒 | ADMIN | Liste enveloppes |
| 80 | `POST` | `/budget/enveloppes` | 🔒 | ADMIN | Créer |
| 81 | `GET` | `/budget/enveloppes/:id` | 🔒 | ADMIN | Détail |
| 82 | `PUT` | `/budget/enveloppes/:id` | 🔒 | ADMIN | Modifier |
| 83 | `POST` | `/budget/enveloppes/:id/delete` | 🔒 | ADMIN | Archiver → 204 |
| 84 | `GET` | `/budget/depenses` | 🔒 | ADMIN | Liste dépenses |
| 85 | `POST` | `/budget/depenses` | 🔒 | ADMIN | Créer |
| 86 | `GET` | `/budget/depenses/:id` | 🔒 | ADMIN | Détail |
| 87 | `PUT` | `/budget/depenses/:id` | 🔒 | ADMIN | Modifier |
| 88 | `POST` | `/budget/depenses/:id/delete` | 🔒 | ADMIN | Archiver → 204 |

**Statuts enveloppe :** `actif`, `clos`, `brouillon`

**Statuts dépense :** `en_attente`, `approuve`, `refuse`, `paye`

---

## 13. Documents — `/api/documents` (2 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 89 | `GET` | `/documents/me` | 🔒 | PWA | Mes documents RH |
| 90 | `GET` | `/documents/:id/download` | 🔒 | PWA | Télécharger (fichier brut) |

> Pas de route admin d'upload document exposée actuellement côté API.

**Types document :** `contrat`, `attestation`, `certificat`, `autre`

---

## 14. Notifications — `/api/notifications` (4 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 91 | `GET` | `/notifications/me` | 🔒 | ADMIN+PWA | Mes notifications (centralisées) |
| 92 | `GET` | `/notifications/me/unread-count` | 🔒 | ADMIN+PWA | Badge non lues `{ count }` |
| 93 | `PUT` | `/notifications/me/read-all` | 🔒 | ADMIN+PWA | Tout marquer comme lu |
| 94 | `PUT` | `/notifications/:id/read` | 🔒 | ADMIN+PWA | Marquer une notification |

**Types notification :** `absence`, `paie`, `document`, `conge`, `systeme`

---

## 15. Activité — `/api/activite` (1 route)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 93 | `GET` | `/activite` | 🔒 | ADMIN | Journal d'activité |

**Query :** `limit`, `employe_id`

---

## 16. Exemples (dev) — `/api/example` (2 routes)

| # | Méthode | Route | Auth | Cible | Description |
|---|---------|-------|------|-------|-------------|
| 94 | `GET` | `/example/admin-only` | 👑 | DEV | Test guard admin |
| 95 | `GET` | `/example/public-route` | 🌐 | DEV | Test route publique |

---

## Synthèse par application frontend

### PWA Employé — 18 routes à vérifier

```
POST /auth/login
POST /auth/logout
POST /auth/register-employee
POST /auth/refresh-token
GET  /auth/me

GET  /employes/me
PUT  /employes/me
PUT  /employes/me/avatar

GET  /absences/me
GET  /absences/balance/me
POST /absences
POST /absences/:id/delete

GET  /paie/me
GET  /paie/:id/download

GET  /documents/me
GET  /documents/:id/download

GET  /notifications/me
GET  /notifications/me/unread-count
PUT  /notifications/me/read-all
PUT  /notifications/:id/read
```

### Admin RH — routes principales (hors `/me` PWA)

Tous les modules sauf routes `/me` employé, plus :

```
/users/*                    (admin only)
/employes/*                 (CRUD + stats)
/presences/*
/absences                     (GET liste, PUT validation)
/paie/*                       (stats, génération, validation)
/offres/*  /candidatures/*
/competences/* /formations/* /evaluations/*
/dashboard/*  /statistiques/*
/budget/*
/activite
```

---

## Checklist vérification frontend

### Configuration

- [ ] Base URL pointe vers `/api`
- [ ] Header `Authorization: Bearer <token>` sur routes 🔒
- [ ] Parser `{ ok, data }` en succès
- [ ] Parser `{ ok: false, error }` en erreur
- [ ] Téléchargements : pas d'enveloppe JSON
- [ ] Suppressions : `POST .../delete`, attendre **204**

### Auth

- [ ] Login admin et employé
- [ ] Refresh token avant expiration
- [ ] Redirect si 401

### Admin — Employés

- [ ] Liste avec filtres query snake_case
- [ ] Création / édition fiche
- [ ] Champ **`dateFinContrat`** au départ
- [ ] Upload avatar admin

### Admin — Paie

- [ ] Génération masse `{ mois, annee }`
- [ ] Affichage **`summary`** + **`skippedDetails`**
- [ ] Badge prorata `joursTravailles/joursPeriode`
- [ ] Marquer bulletin `statut: "paye"`
- [ ] Erreur 400 création manuelle

### Admin — Absences

- [ ] Validation statut (`approuve` / `refuse`)
- [ ] Filtres liste admin

### PWA

- [ ] Solde congés (`total`, `pris`, `restant`, `en_attente`)
- [ ] Bulletins payés uniquement
- [ ] Prorata sur bulletin
- [ ] Notifications lues

### Enums à synchroniser (types TS frontend)

| Enum | Valeurs |
|------|---------|
| `StatutEmploye` | `actif`, `inactif`, `suspendu` |
| `StatutAbsence` | `en_attente`, `approuve`, `refuse` |
| `TypeAbsence` | `maladie`, `conge_paye`, `conge_sans_solde`, `maternite`, `paternite`, `autre` |
| `StatutPaie` | `en_attente`, `paye`, `annule` |
| `StatutPresence` | `present`, `absent`, `retard`, `conge`, `mission` |
| `UserRole` | `admin`, `manager`, `rh`, `employee` |
| `PaieSkipReason` | `deja_existant`, `statut_inactif`, `statut_suspendu`, `non_embauche`, `depart_avant_periode`, `salaire_zero` |

---

## Documents liés

| Fichier | Contenu |
|---------|---------|
| [README-PWA-EMPLOYEE.md](./README-PWA-EMPLOYEE.md) | Détail routes PWA + exemples curl |
| [README-FRONTEND.md](./README-FRONTEND.md) | Changements récents (prorata, dateFinContrat, génération paie) |
| [README-NOTIFICATIONS.md](./README-NOTIFICATIONS.md) | Notifications centralisées admin + PWA |
| `/api/docs` | Swagger interactif |

---

## Codes HTTP courants

| Code | Situation |
|------|-----------|
| 200 | Succès GET / PUT |
| 201 | Succès POST création |
| 204 | Suppression logique |
| 400 | Validation / règle métier (ex. paie non éligible) |
| 401 | JWT absent ou invalide |
| 403 | Rôle insuffisant (`/users` admin) |
| 404 | Ressource introuvable |
| 409 | Conflit (ex. bulletin déjà existant) |

---

*Audit généré depuis les contrôleurs NestJS — BV Groupe RH backend.*
