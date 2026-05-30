# Guide Frontend — BV Groupe RH API

Document de référence pour adapter les applications **admin RH** et **PWA employé** aux dernières modifications du backend.

> Routes PWA employé (liste complète) : voir [README-PWA-EMPLOYEE.md](./README-PWA-EMPLOYEE.md)

---

## Informations communes

| Élément | Valeur |
|---------|--------|
| **Base URL** | `http://localhost:3000/api` |
| **Swagger** | `/api/docs` |
| **Auth** | `Authorization: Bearer <token>` |
| **Succès** | `{ "ok": true, "data": ... }` |
| **Erreur** | `{ "ok": false, "message": "...", "statusCode": ... }` |
| **Naming JSON** | camelCase (`employeId`, `dateFinContrat`, `joursTravailles`) |

---

## Résumé des changements récents

| Zone | Changement | Impact frontend |
|------|------------|-----------------|
| **Employés** | Nouveau champ `dateFinContrat` | Formulaire création / édition / départ |
| **Paie — génération masse** | Logique d'éligibilité + réponse enrichie | Modal / toast après génération |
| **Paie — bulletins** | Champs `joursTravailles`, `joursPeriode` | Affichage prorata admin + PWA |
| **Paie — création manuelle** | Validation éligibilité (400 si refus) | Gérer message d'erreur explicite |
| **Absences PWA** | `GET /absences/balance/me` aligné | Déjà documenté côté PWA |

---

## 1. Application ADMIN — routes à modifier

### 1.1 Fiche employé — `dateFinContrat`

**Routes concernées :**

| Méthode | Route | Action frontend |
|---------|-------|-----------------|
| `GET` | `/employes` | Afficher `dateFinContrat` dans la liste (optionnel) |
| `GET` | `/employes/:id` | Afficher dans la fiche détail |
| `POST` | `/employes` | Champ optionnel à la création |
| `PUT` | `/employes/:id` | **Champ obligatoire au départ** (avec `statut: "inactif"`) |

**Payload exemple — enregistrer un départ :**

```http
PUT /api/employes/12
Content-Type: application/json
Authorization: Bearer <token>
```

```json
{
  "statut": "inactif",
  "dateFinContrat": "2026-05-15"
}
```

**Types TypeScript (admin) :**

```typescript
export type StatutEmploye = "actif" | "inactif" | "suspendu";

export interface Employe {
  id: number;
  matricule?: string | null;
  nom: string;
  prenom: string;
  dateEmbauche?: string | null;      // ISO date
  dateFinContrat?: string | null;    // NOUVEAU — ISO date
  statut: StatutEmploye;
  salaireBase: number;
  defPrimeTransport: number;
  defPrimeLogement: number;
  defPrimePerformance: number;
  defAutresPrimes: number;
  // ... autres champs existants
}

export interface CreateEmployePayload {
  nom: string;
  prenom: string;
  dateEmbauche?: string;
  dateFinContrat?: string;           // NOUVEAU
  statut?: StatutEmploye;
  salaireBase?: number;
  // ...
}
```

**UI recommandée :**

- Ajouter un champ **« Date de fin de contrat »** (date picker) sur la fiche employé.
- Lors d'un passage à **Inactif** ou **Suspendu**, proposer de renseigner `dateFinContrat`.
- Pour un **départ**, `dateFinContrat` est requis pour générer le **dernier bulletin proratisé**.

---

### 1.2 Paie — génération en masse (réponse enrichie)

**Route :**

```http
POST /api/paie
Content-Type: application/json
Authorization: Bearer <token>
```

**Corps (mode génération — inchangé) :**

```json
{
  "mois": "05",
  "annee": 2026
}
```

> Ne pas envoyer `employeId` : le backend détecte automatiquement le mode masse.

**Réponse (`data`) — NOUVELLE structure :**

```json
{
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
  "bulletins": [ /* tableau de bulletins créés */ ]
}
```

**Types TypeScript :**

```typescript
export type PaieSkipReason =
  | "deja_existant"
  | "statut_inactif"
  | "statut_suspendu"
  | "non_embauche"
  | "depart_avant_periode"
  | "salaire_zero";

export interface PaieSkipSummary {
  deja_existant: number;
  statut_inactif: number;
  statut_suspendu: number;
  non_embauche: number;
  depart_avant_periode: number;
  salaire_zero: number;
}

export interface PaieSkippedEntry {
  employeId: number;
  nom: string;
  prenom: string;
  reason: PaieSkipReason;
  message: string;
}

export interface GeneratePaieResult {
  generated: number;
  skipped: number;
  summary: PaieSkipSummary;
  skippedDetails: PaieSkippedEntry[];
  bulletins: BulletinPaie[];
}
```

**Libellés UI suggérés (`reason` → français) :**

| `reason` | Libellé |
|----------|---------|
| `deja_existant` | Bulletin déjà existant |
| `statut_inactif` | Inactif / archivé |
| `statut_suspendu` | Suspendu |
| `non_embauche` | Pas encore embauché sur la période |
| `depart_avant_periode` | Départ avant le mois cible |
| `salaire_zero` | Salaire de base nul |

**UI recommandée (page Paie admin) :**

1. Bouton « Générer les bulletins » → `POST /paie` avec `{ mois, annee }`.
2. Afficher un **récapitulatif** : `X générés`, `Y ignorés`.
3. Tableau ou liste déroulante **`skippedDetails`** avec nom + `message`.
4. Compteurs par **`summary`** (badges ou graphique).

**Ancien comportement supprimé :** la génération ne crée plus de bulletins pour **tous** les employés sans distinction. Seuls les profils **éligibles** reçoivent un bulletin.

---

### 1.3 Paie — bulletin (prorata)

**Routes concernées :**

| Méthode | Route | Changement |
|---------|-------|------------|
| `GET` | `/paie` | Champs `joursTravailles`, `joursPeriode` sur chaque bulletin |
| `GET` | `/paie/:id` | Idem |
| `GET` | `/paie/:id/download` | Texte PDF inclut la ligne prorata si applicable |
| `POST` | `/paie` (manuel) | Erreur **400** si employé non éligible |

**Type bulletin enrichi :**

```typescript
export interface BulletinPaie {
  id: number;
  employeId: number;
  mois: string;
  annee: number;
  salaireBase: number;
  primeTransport: number;
  primeLogement: number;
  primePerformance: number;
  autresPrimes: number;
  cnss: number;
  impot: number;
  autresRetenues: number;
  salaireNet: number | null;
  statut: "en_attente" | "paye" | "annule";
  datePaiement?: string | null;
  joursTravailles?: number | null;   // NOUVEAU — ex. 15
  joursPeriode?: number | null;      // NOUVEAU — ex. 31
  employe?: {
    nom: string;
    prenom: string;
    poste?: string | null;
    departement?: string | null;
  };
}
```

**Affichage prorata (admin) :**

```typescript
function formatProrata(b: BulletinPaie): string | null {
  if (
    b.joursTravailles != null &&
    b.joursPeriode != null &&
    b.joursTravailles < b.joursPeriode
  ) {
    return `Prorata : ${b.joursTravailles}/${b.joursPeriode} jours`;
  }
  return null;
}
```

**Erreur création manuelle (400) — exemple :**

```json
{
  "ok": false,
  "message": "Paie impossible pour Marie Dupont : Employé suspendu — bulletin non généré automatiquement",
  "statusCode": 400
}
```

→ Afficher `message` tel quel dans un toast / alerte.

---

### 1.4 Paie — autres routes admin (inchangées)

| Méthode | Route | Usage |
|---------|-------|-------|
| `GET` | `/paie/stats` | Dashboard stats paie |
| `GET` | `/paie/evolution` | Graphique masse salariale |
| `PUT` | `/paie/:id` | Valider / marquer payé |
| `POST` | `/paie/:id/delete` | Archiver bulletin |

---

## 2. PWA Employé — routes à adapter

Référence complète : [README-PWA-EMPLOYEE.md](./README-PWA-EMPLOYEE.md)

### Modifications côté PWA

| Fichier / service | Route | Modification |
|-------------------|-------|--------------|
| `employee.service.ts` | `GET /employes/me` | Lire `dateFinContrat` si affiché |
| `employee.service.ts` | `PUT /employes/me` | Pas de changement obligatoire |
| `payslips.service.ts` | `GET /paie/me` | Afficher prorata via `joursTravailles` / `joursPeriode` |
| `leaves.service.ts` | `GET /absences/balance/me` | Champs : `total`, `pris`, `restant`, `en_attente` (+ alias backend) |

**Type bulletin PWA :**

```typescript
export interface Payslip {
  id: number;
  mois: string;
  annee: number;
  salaireNet: number;
  statut: string;
  joursTravailles?: number | null;
  joursPeriode?: number | null;
  // ...
}
```

**Exemple affichage carte bulletin :**

```
Mai 2026 — 425 000 FCFA
Prorata : 15/31 jours   ← si joursTravailles < joursPeriode
```

> La PWA ne reçoit que les bulletins **`statut: "paye"`** via `GET /paie/me`.

---

## 3. Tableau synthèse — fichiers frontend à toucher

### Admin RH

| Écran / module | Fichiers typiques | API |
|----------------|-------------------|-----|
| Formulaire employé | `EmployeForm.tsx`, `employes.service.ts`, `types/employe.ts` | `POST/PUT /employes` |
| Liste employés | `EmployesList.tsx` | `GET /employes` |
| Génération paie | `PaieGenerate.tsx`, `paie.service.ts` | `POST /paie` |
| Liste bulletins | `PaieList.tsx`, `BulletinDetail.tsx` | `GET /paie` |
| Détail bulletin | `BulletinDetail.tsx` | `GET /paie/:id`, download |

### PWA employé

| Écran | Fichiers typiques | API |
|-------|-------------------|-----|
| Mes bulletins | `PayslipsPage.tsx`, `payslips.service.ts` | `GET /paie/me` |
| Mon profil | `ProfilePage.tsx`, `employee.service.ts` | `GET /employes/me` |
| Solde congés | `LeavesPage.tsx`, `leaves.service.ts` | `GET /absences/balance/me` |

---

## 4. Exemples d'intégration (services)

### Admin — génération paie

```typescript
// paie.service.ts
export async function generateBulletins(mois: string, annee: number) {
  const { data } = await api.post<{ ok: true; data: GeneratePaieResult }>(
    "/paie",
    { mois, annee },
  );
  return data;
}
```

### Admin — enregistrer un départ

```typescript
// employes.service.ts
export async function enregistrerDepart(
  employeId: number,
  dateFinContrat: string,
) {
  const { data } = await api.put(`/employes/${employeId}`, {
    statut: "inactif",
    dateFinContrat,
  });
  return data;
}
```

### PWA — bulletins avec prorata

```typescript
// payslips.service.ts
export function getProrataLabel(p: Payslip): string | undefined {
  if (
    p.joursTravailles != null &&
    p.joursPeriode != null &&
    p.joursTravailles < p.joursPeriode
  ) {
    return `${p.joursTravailles}/${p.joursPeriode} jours`;
  }
  return undefined;
}
```

---

## 5. Règles métier (à respecter côté UI)

### Génération automatique de paie

Un employé reçoit un bulletin auto **uniquement si** :

- statut **`actif`**, ou **`inactif`** avec `dateFinContrat` dans le mois ;
- **pas** suspendu ;
- salaire de base **> 0** ;
- embauché **avant la fin** du mois cible ;
- contrat **non terminé avant** le début du mois.

### Prorata

- Embauche en cours de mois → montants réduits automatiquement.
- Départ en cours de mois (`dateFinContrat`) → idem.
- Ratio = jours travaillés / jours du mois (calendaires).

### Workflow départ recommandé (admin)

```
1. PUT /employes/:id  { statut: "inactif", dateFinContrat: "2026-05-15" }
2. POST /paie         { mois: "05", annee: 2026 }
3. Vérifier bulletin proratisé dans la réponse (joursTravailles: 15)
4. PUT /paie/:id      { statut: "paye" }  → visible PWA via GET /paie/me
```

---

## 6. Checklist migration frontend

- [ ] Ajouter `dateFinContrat` au type `Employe` et au formulaire admin
- [ ] Demander `dateFinContrat` lors du passage en statut inactif
- [ ] Adapter le handler `POST /paie` (mode masse) pour lire `summary` + `skippedDetails`
- [ ] Afficher le détail des employés ignorés après génération
- [ ] Ajouter `joursTravailles` / `joursPeriode` au type `BulletinPaie`
- [ ] Afficher le badge prorata sur les listes admin et PWA
- [ ] Gérer les erreurs 400 à la création manuelle de bulletin
- [ ] (PWA) Vérifier mapping solde congés `GET /absences/balance/me`

---

## 7. Environnement

```env
# Frontend (.env)
VITE_API_URL=http://localhost:3000/api
# ou NEXT_PUBLIC_API_URL selon le framework
```

Headers communs :

```typescript
api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
```
