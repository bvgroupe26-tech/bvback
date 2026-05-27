/**
 * Migration SQLite → PostgreSQL (BV Groupe RH)
 *
 * Usage:
 *   npm run migrate:sqlite
 *   npm run migrate:sqlite -- --dry-run
 *
 * Source : BV_DB_PATH ou ~/.bv-groupe-rh/bv-rh.db
 * Cible  : DATABASE_URL (Prisma / PostgreSQL)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_SQLITE_PATH = path.join(
  os.homedir(),
  '.bv-groupe-rh',
  'bv-rh.db',
);

const SQLITE_PATH = process.env.BV_DB_PATH ?? DEFAULT_SQLITE_PATH;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Types ───────────────────────────────────────────────────────────────────

type SqliteRow = Record<string, unknown>;

interface TableReport {
  table: string;
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function col(row: SqliteRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key];
    }
  }
  return undefined;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'null';
  }
  return false;
}

function parseNullableString(value: unknown): string | null {
  if (isEmpty(value)) return null;
  return String(value);
}

function parseRequiredString(value: unknown, field: string): string {
  const result = parseNullableString(value);
  if (result === null) {
    throw new Error(`Champ requis manquant : ${field}`);
  }
  return result;
}

function parseDate(value: unknown): Date | null {
  if (isEmpty(value)) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide : ${String(value)}`);
  }
  return date;
}

function parseRequiredDate(value: unknown, field: string): Date {
  const date = parseDate(value);
  if (!date) {
    throw new Error(`Date requise manquante : ${field}`);
  }
  return date;
}

function parseNumber(value: unknown, defaultValue = 0): number {
  if (isEmpty(value)) return defaultValue;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Nombre invalide : ${String(value)}`);
  }
  return num;
}

function parseNullableNumber(value: unknown): number | null {
  if (isEmpty(value)) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num;
}

function parseIntId(value: unknown, field: string): number {
  const num = parseNumber(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`ID invalide pour ${field} : ${String(value)}`);
  }
  return num;
}

function parseNullableIntId(value: unknown): number | null {
  if (isEmpty(value)) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | null {
  if (isEmpty(value)) return null;
  if (typeof value === 'object') return value as Prisma.InputJsonValue;
  try {
    return JSON.parse(String(value)) as Prisma.InputJsonValue;
  } catch {
    throw new Error(`JSON invalide : ${String(value)}`);
  }
}

function readTable(db: Database.Database, tableName: string): SqliteRow[] {
  try {
    return db.prepare(`SELECT * FROM ${tableName}`).all() as SqliteRow[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Impossible de lire la table SQLite "${tableName}" : ${message}`);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

// ─── Migration engine ────────────────────────────────────────────────────────

async function migrateWithCreateMany<T extends Record<string, unknown>>(
  label: string,
  rows: SqliteRow[],
  transform: (row: SqliteRow) => T | null,
  modelCreateMany: (data: T[]) => Promise<{ count: number }>,
  modelCreate: (data: T) => Promise<unknown>,
): Promise<TableReport> {
  const report: TableReport = {
    table: label,
    total: rows.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
  };

  const transformed: T[] = [];

  for (const row of rows) {
    try {
      const data = transform(row);
      if (data === null) {
        report.skipped++;
        continue;
      }
      transformed.push(data);
    } catch (error) {
      report.failed++;
      const id = col(row, 'id');
      console.error(`  ✗ ${label} id=${id ?? '?'} (transform) :`, error);
    }
  }

  if (DRY_RUN) {
    report.migrated = transformed.length;
    console.log(
      `[dry-run] Migration ${label} : ${report.migrated}/${report.total} ✓` +
        (report.skipped > 0 ? ` (${report.skipped} ignorées)` : '') +
        (report.failed > 0 ? ` (${report.failed} erreurs)` : ''),
    );
    return report;
  }

  const CHUNK = 100;

  for (let i = 0; i < transformed.length; i += CHUNK) {
    const chunk = transformed.slice(i, i + CHUNK);

    try {
      const result = await modelCreateMany(chunk);
      report.migrated += result.count;
      report.skipped += chunk.length - result.count;
    } catch {
      for (const item of chunk) {
        try {
          await modelCreate(item);
          report.migrated++;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            report.skipped++;
          } else {
            report.failed++;
            const id = (item as { id?: number }).id;
            console.error(`  ✗ ${label} id=${id ?? '?'} :`, error);
          }
        }
      }
    }
  }

  console.log(
    `Migration ${label} : ${report.migrated}/${report.total} ✓` +
      (report.skipped > 0 ? ` (${report.skipped} ignorées)` : '') +
      (report.failed > 0 ? ` (${report.failed} erreurs)` : ''),
  );

  return report;
}

async function resetSequences(prisma: PrismaClient): Promise<void> {
  const tables = [
    'users',
    'employes',
    'offres_emploi',
    'candidatures',
    'presences',
    'absences',
    'paie',
    'competences',
    'formations',
    'evaluations',
    'activite_log',
    'budget_categories',
    'budget_enveloppes',
    'budget_depenses',
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM "${table}"), 1),
        true
      );
    `);
  }
}

// ─── Transformateurs (format createMany : clés étrangères scalaires) ─────────

function transformUser(row: SqliteRow): Prisma.UserCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    email: parseRequiredString(col(row, 'email'), 'email'),
    passwordHash: parseRequiredString(
      col(row, 'password_hash', 'passwordHash'),
      'password_hash',
    ),
    nom: parseRequiredString(col(row, 'nom'), 'nom'),
    prenom: parseRequiredString(col(row, 'prenom'), 'prenom'),
    role: parseRequiredString(col(row, 'role'), 'role') as Prisma.UserCreateManyInput['role'],
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
    lastLogin: parseDate(col(row, 'last_login', 'lastLogin')),
  };
}

function transformEmploye(row: SqliteRow): Prisma.EmployeCreateManyInput | null {
  const situation = parseNullableString(
    col(row, 'situation_familiale', 'situationFamiliale'),
  );
  const typeContrat = parseNullableString(col(row, 'type_contrat', 'typeContrat'));

  return {
    id: parseIntId(col(row, 'id'), 'id'),
    nom: parseRequiredString(col(row, 'nom'), 'nom'),
    prenom: parseRequiredString(col(row, 'prenom'), 'prenom'),
    dateNaissance: parseDate(col(row, 'date_naissance', 'dateNaissance')),
    telephone: parseNullableString(col(row, 'telephone')),
    email: parseNullableString(col(row, 'email')),
    adresse: parseNullableString(col(row, 'adresse')),
    situationFamiliale: situation as Prisma.EmployeCreateManyInput['situationFamiliale'],
    nombreEnfants: parseNumber(col(row, 'nombre_enfants', 'nombreEnfants'), 0),
    typeContrat: typeContrat as Prisma.EmployeCreateManyInput['typeContrat'],
    poste: parseNullableString(col(row, 'poste')),
    departement: parseNullableString(col(row, 'departement')),
    dateEmbauche: parseDate(col(row, 'date_embauche', 'dateEmbauche')),
    statut: (parseNullableString(col(row, 'statut')) ??
      'actif') as Prisma.EmployeCreateManyInput['statut'],
    salaireBase: parseNumber(col(row, 'salaire_base', 'salaireBase'), 0),
    defPrimeTransport: parseNumber(
      col(row, 'def_prime_transport', 'defPrimeTransport'),
      0,
    ),
    defPrimeLogement: parseNumber(col(row, 'def_prime_logement', 'defPrimeLogement'), 0),
    defPrimePerformance: parseNumber(
      col(row, 'def_prime_performance', 'defPrimePerformance'),
      0,
    ),
    defAutresPrimes: parseNumber(col(row, 'def_autres_primes', 'defAutresPrimes'), 0),
    defTauxCnss: parseNullableNumber(col(row, 'def_taux_cnss', 'defTauxCnss')),
    defTauxImpot: parseNullableNumber(col(row, 'def_taux_impot', 'defTauxImpot')),
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
    updatedAt: parseRequiredDate(col(row, 'updated_at', 'updatedAt'), 'updated_at'),
  };
}

function transformOffreEmploi(row: SqliteRow): Prisma.OffreEmploiCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    titre: parseRequiredString(col(row, 'titre'), 'titre'),
    departement: parseNullableString(col(row, 'departement')),
    typeContrat: parseRequiredString(
      col(row, 'type_contrat', 'typeContrat'),
      'type_contrat',
    ) as Prisma.OffreEmploiCreateManyInput['typeContrat'],
    description: parseRequiredString(col(row, 'description'), 'description'),
    competencesRequises: parseNullableString(
      col(row, 'competences_requises', 'competencesRequises'),
    ),
    cibleCandidats: parseNumber(col(row, 'cible_candidats', 'cibleCandidats'), 10),
    datePublication: parseRequiredDate(
      col(row, 'date_publication', 'datePublication'),
      'date_publication',
    ),
    dateCloture: parseDate(col(row, 'date_cloture', 'dateCloture')),
    statut: (parseNullableString(col(row, 'statut')) ??
      'ouverte') as Prisma.OffreEmploiCreateManyInput['statut'],
  };
}

function transformCandidature(row: SqliteRow): Prisma.CandidatureCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    offreId: parseIntId(col(row, 'offre_id', 'offreId'), 'offre_id'),
    nom: parseRequiredString(col(row, 'nom'), 'nom'),
    prenom: parseRequiredString(col(row, 'prenom'), 'prenom'),
    email: parseRequiredString(col(row, 'email'), 'email'),
    telephone: parseNullableString(col(row, 'telephone')),
    cvPath: parseNullableString(col(row, 'cv_path', 'cvPath')),
    lettreMotivation: parseNullableString(
      col(row, 'lettre_motivation', 'lettreMotivation'),
    ),
    statut: (parseNullableString(col(row, 'statut')) ??
      'recu') as Prisma.CandidatureCreateManyInput['statut'],
    dateCandidature: parseRequiredDate(
      col(row, 'date_candidature', 'dateCandidature'),
      'date_candidature',
    ),
  };
}

function transformPresence(row: SqliteRow): Prisma.PresenceCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    date: parseRequiredDate(col(row, 'date'), 'date'),
    heureEntree: parseNullableString(col(row, 'heure_entree', 'heureEntree')),
    heureSortie: parseNullableString(col(row, 'heure_sortie', 'heureSortie')),
    statut: parseRequiredString(
      col(row, 'statut'),
      'statut',
    ) as Prisma.PresenceCreateManyInput['statut'],
    justification: parseNullableString(col(row, 'justification')),
    heuresSupplementaires: parseNumber(
      col(row, 'heures_supplementaires', 'heuresSupplementaires'),
      0,
    ),
  };
}

function transformAbsence(row: SqliteRow): Prisma.AbsenceCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    dateDebut: parseRequiredDate(col(row, 'date_debut', 'dateDebut'), 'date_debut'),
    dateFin: parseRequiredDate(col(row, 'date_fin', 'dateFin'), 'date_fin'),
    typeAbsence: parseRequiredString(
      col(row, 'type_absence', 'typeAbsence'),
      'type_absence',
    ) as Prisma.AbsenceCreateManyInput['typeAbsence'],
    justification: parseNullableString(col(row, 'justification')),
    statut: (parseNullableString(col(row, 'statut')) ??
      'en_attente') as Prisma.AbsenceCreateManyInput['statut'],
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
  };
}

function transformPaie(row: SqliteRow): Prisma.PaieCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    mois: parseRequiredString(col(row, 'mois'), 'mois'),
    annee: parseNumber(col(row, 'annee'), 0),
    salaireBase: parseNumber(col(row, 'salaire_base', 'salaireBase'), 0),
    primeTransport: parseNumber(col(row, 'prime_transport', 'primeTransport'), 0),
    primeLogement: parseNumber(col(row, 'prime_logement', 'primeLogement'), 0),
    primePerformance: parseNumber(col(row, 'prime_performance', 'primePerformance'), 0),
    autresPrimes: parseNumber(col(row, 'autres_primes', 'autresPrimes'), 0),
    cnss: parseNumber(col(row, 'cnss'), 0),
    impot: parseNumber(col(row, 'impot'), 0),
    autresRetenues: parseNumber(col(row, 'autres_retenues', 'autresRetenues'), 0),
    salaireNet: parseNullableNumber(col(row, 'salaire_net', 'salaireNet')),
    statut: (parseNullableString(col(row, 'statut')) ??
      'en_attente') as Prisma.PaieCreateManyInput['statut'],
    datePaiement: parseDate(col(row, 'date_paiement', 'datePaiement')),
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
  };
}

function transformCompetence(row: SqliteRow): Prisma.CompetenceCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    nomCompetence: parseRequiredString(
      col(row, 'nom_competence', 'nomCompetence'),
      'nom_competence',
    ),
    niveau: parseRequiredString(
      col(row, 'niveau'),
      'niveau',
    ) as Prisma.CompetenceCreateManyInput['niveau'],
    categorie: parseNullableString(col(row, 'categorie')),
  };
}

function transformFormation(row: SqliteRow): Prisma.FormationCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    titre: parseRequiredString(col(row, 'titre'), 'titre'),
    type: parseRequiredString(col(row, 'type'), 'type') as Prisma.FormationCreateManyInput['type'],
    organisme: parseNullableString(col(row, 'organisme')),
    dateObtention: parseRequiredDate(
      col(row, 'date_obtention', 'dateObtention'),
      'date_obtention',
    ),
    dateExpiration: parseDate(col(row, 'date_expiration', 'dateExpiration')),
    fichierPath: parseNullableString(col(row, 'fichier_path', 'fichierPath')),
  };
}

function transformEvaluation(row: SqliteRow): Prisma.EvaluationCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    employeId: parseIntId(col(row, 'employe_id', 'employeId'), 'employe_id'),
    periode: parseRequiredString(col(row, 'periode'), 'periode'),
    noteGlobale: parseNullableNumber(col(row, 'note_globale', 'noteGlobale')),
    ponctualite: parseNullableNumber(col(row, 'ponctualite')),
    qualiteTravail: parseNullableNumber(col(row, 'qualite_travail', 'qualiteTravail')),
    travailEquipe: parseNullableNumber(col(row, 'travail_equipe', 'travailEquipe')),
    initiative: parseNullableNumber(col(row, 'initiative')),
    commentaire: parseNullableString(col(row, 'commentaire')),
    evaluateur: parseNullableString(col(row, 'evaluateur')),
    dateEvaluation: parseRequiredDate(
      col(row, 'date_evaluation', 'dateEvaluation'),
      'date_evaluation',
    ),
  };
}

function transformActiviteLog(
  row: SqliteRow,
  employeIds: Set<number>,
): Prisma.ActiviteLogCreateManyInput | null {
  const employeId = parseNullableIntId(col(row, 'employe_id', 'employeId'));

  if (employeId !== null && !employeIds.has(employeId)) {
    return null;
  }

  return {
    id: parseIntId(col(row, 'id'), 'id'),
    type: parseRequiredString(col(row, 'type'), 'type'),
    description: parseRequiredString(col(row, 'description'), 'description'),
    employeId,
    meta: parseJson(col(row, 'meta')),
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
  };
}

function transformBudgetCategorie(
  row: SqliteRow,
): Prisma.BudgetCategorieCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    code: parseRequiredString(col(row, 'code'), 'code'),
    libelle: parseRequiredString(col(row, 'libelle'), 'libelle'),
    description: parseNullableString(col(row, 'description')),
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
  };
}

function transformBudgetEnveloppe(
  row: SqliteRow,
): Prisma.BudgetEnveloppeCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    libelle: parseRequiredString(col(row, 'libelle'), 'libelle'),
    departement: parseNullableString(col(row, 'departement')),
    annee: parseNumber(col(row, 'annee'), 0),
    montantPrevu: parseNumber(col(row, 'montant_prevu', 'montantPrevu'), 0),
    statut: (parseNullableString(col(row, 'statut')) ??
      'actif') as Prisma.BudgetEnveloppeCreateManyInput['statut'],
    notes: parseNullableString(col(row, 'notes')),
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
    updatedAt: parseRequiredDate(col(row, 'updated_at', 'updatedAt'), 'updated_at'),
  };
}

function transformBudgetDepense(
  row: SqliteRow,
): Prisma.BudgetDepenseCreateManyInput | null {
  return {
    id: parseIntId(col(row, 'id'), 'id'),
    enveloppeId: parseIntId(col(row, 'enveloppe_id', 'enveloppeId'), 'enveloppe_id'),
    categorieId: parseNullableIntId(col(row, 'categorie_id', 'categorieId')),
    libelle: parseRequiredString(col(row, 'libelle'), 'libelle'),
    montant: parseNumber(col(row, 'montant'), 0),
    dateDepense: parseRequiredDate(col(row, 'date_depense', 'dateDepense'), 'date_depense'),
    fournisseur: parseNullableString(col(row, 'fournisseur')),
    referencePiece: parseNullableString(col(row, 'reference_piece', 'referencePiece')),
    commentaire: parseNullableString(col(row, 'commentaire')),
    statut: (parseNullableString(col(row, 'statut')) ??
      'en_attente') as Prisma.BudgetDepenseCreateManyInput['statut'],
    createdAt: parseRequiredDate(col(row, 'created_at', 'createdAt'), 'created_at'),
  };
}

// ─── Résolution noms de tables SQLite ────────────────────────────────────────

const SQLITE_TABLE_ALIASES: Record<string, string[]> = {
  users: ['users'],
  employes: ['employes'],
  offresEmploi: ['offres_emploi', 'offresEmploi'],
  candidatures: ['candidatures'],
  presences: ['presences'],
  absences: ['absences'],
  paie: ['paie'],
  competences: ['competences'],
  formations: ['formations'],
  evaluations: ['evaluations'],
  activiteLog: ['activite_log', 'activiteLog'],
  budgetCategories: ['budget_categories', 'budgetCategories'],
  budgetEnveloppes: ['budget_enveloppes', 'budgetEnveloppes'],
  budgetDepenses: ['budget_depenses', 'budgetDepenses'],
};

function resolveSqliteTable(db: Database.Database, key: string): string {
  const candidates = SQLITE_TABLE_ALIASES[key] ?? [key];
  for (const name of candidates) {
    const exists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(name);
    if (exists) return name;
  }
  return candidates[0];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  BV Groupe RH — Migration SQLite → PostgreSQL');
  console.log('═'.repeat(60));
  console.log(`  Source : ${SQLITE_PATH}`);
  console.log(`  Mode   : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'ÉCRITURE'}`);
  console.log('═'.repeat(60));

  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(
      `Base SQLite introuvable : ${SQLITE_PATH}\n` +
        'Définissez BV_DB_PATH ou placez le fichier dans ~/.bv-groupe-rh/bv-rh.db',
    );
  }

  const db = new Database(SQLITE_PATH, { readonly: true });
  const prisma = new PrismaClient();
  const reports: TableReport[] = [];

  try {
    reports.push(
      await migrateWithCreateMany(
        'users',
        readTable(db, resolveSqliteTable(db, 'users')),
        transformUser,
        (items) => prisma.user.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.user.create({ data: item }),
      ),
    );

    const employesRows = readTable(db, resolveSqliteTable(db, 'employes'));

    reports.push(
      await migrateWithCreateMany(
        'employes',
        employesRows,
        transformEmploye,
        (items) => prisma.employe.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.employe.create({ data: item }),
      ),
    );

    const employeIds = new Set(
      employesRows.map((r) => Number(col(r, 'id'))).filter((id) => id > 0),
    );

    reports.push(
      await migrateWithCreateMany(
        'offresEmploi',
        readTable(db, resolveSqliteTable(db, 'offresEmploi')),
        transformOffreEmploi,
        (items) =>
          prisma.offreEmploi.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.offreEmploi.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'candidatures',
        readTable(db, resolveSqliteTable(db, 'candidatures')),
        transformCandidature,
        (items) =>
          prisma.candidature.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.candidature.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'presences',
        readTable(db, resolveSqliteTable(db, 'presences')),
        transformPresence,
        (items) => prisma.presence.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.presence.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'absences',
        readTable(db, resolveSqliteTable(db, 'absences')),
        transformAbsence,
        (items) => prisma.absence.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.absence.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'paie',
        readTable(db, resolveSqliteTable(db, 'paie')),
        transformPaie,
        (items) => prisma.paie.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.paie.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'competences',
        readTable(db, resolveSqliteTable(db, 'competences')),
        transformCompetence,
        (items) =>
          prisma.competence.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.competence.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'formations',
        readTable(db, resolveSqliteTable(db, 'formations')),
        transformFormation,
        (items) =>
          prisma.formation.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.formation.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'evaluations',
        readTable(db, resolveSqliteTable(db, 'evaluations')),
        transformEvaluation,
        (items) =>
          prisma.evaluation.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.evaluation.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'activiteLog',
        readTable(db, resolveSqliteTable(db, 'activiteLog')),
        (row) => transformActiviteLog(row, employeIds),
        (items) =>
          prisma.activiteLog.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.activiteLog.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'budgetCategories',
        readTable(db, resolveSqliteTable(db, 'budgetCategories')),
        transformBudgetCategorie,
        (items) =>
          prisma.budgetCategorie.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.budgetCategorie.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'budgetEnveloppes',
        readTable(db, resolveSqliteTable(db, 'budgetEnveloppes')),
        transformBudgetEnveloppe,
        (items) =>
          prisma.budgetEnveloppe.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.budgetEnveloppe.create({ data: item }),
      ),
    );

    reports.push(
      await migrateWithCreateMany(
        'budgetDepenses',
        readTable(db, resolveSqliteTable(db, 'budgetDepenses')),
        transformBudgetDepense,
        (items) =>
          prisma.budgetDepense.createMany({ data: items, skipDuplicates: true }),
        (item) => prisma.budgetDepense.create({ data: item }),
      ),
    );

    if (!DRY_RUN) {
      console.log('\nRéinitialisation des séquences PostgreSQL…');
      await resetSequences(prisma);
    }
  } finally {
    db.close();
    await prisma.$disconnect();
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  RAPPORT FINAL');
  console.log('═'.repeat(60));
  console.log(
    `${'Table'.padEnd(22)} ${'Total'.padStart(6)} ${'Migrées'.padStart(8)} ${'Ignorées'.padStart(9)} ${'Erreurs'.padStart(8)}`,
  );
  console.log('─'.repeat(60));

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const r of reports) {
    console.log(
      `${r.table.padEnd(22)} ${String(r.total).padStart(6)} ${String(r.migrated).padStart(8)} ${String(r.skipped).padStart(9)} ${String(r.failed).padStart(8)}`,
    );
    totalMigrated += r.migrated;
    totalSkipped += r.skipped;
    totalFailed += r.failed;
  }

  console.log('─'.repeat(60));
  console.log(
    `${'TOTAL'.padEnd(22)} ${''.padStart(6)} ${String(totalMigrated).padStart(8)} ${String(totalSkipped).padStart(9)} ${String(totalFailed).padStart(8)}`,
  );
  console.log('═'.repeat(60));

  if (DRY_RUN) {
    console.log('\nDry-run terminé — aucune donnée insérée.');
  } else if (totalFailed > 0) {
    console.log(`\n⚠ Migration terminée avec ${totalFailed} erreur(s).`);
    process.exit(1);
  } else {
    console.log('\n✓ Migration terminée avec succès.');
  }
}

main().catch((error: unknown) => {
  console.error('\n✗ Échec de la migration :', error);
  process.exit(1);
});
