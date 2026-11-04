/** Règles pures du paramétrage paie (historisation datée, barèmes, état de préparation). */

export interface DatedRow {
  id: number;
  dateDebut: Date;
  dateFin: Date | null;
}

export interface InsertPlan {
  dateFin: Date | null;
  closePrevious: { id: number; dateFin: Date } | null;
}

export class SettingsRuleError extends Error {}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Insertion d'une nouvelle valeur datée : la valeur précédente est close la veille de
 * l'entrée en vigueur (dateFin exclusive = dateDebut), une valeur future éventuelle borne la nouvelle.
 */
export function planDatedInsert(existing: DatedRow[], dateDebut: Date): InsertPlan {
  if (Number.isNaN(dateDebut.getTime())) throw new SettingsRuleError('Date de début invalide');
  const rows = [...existing].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
  if (rows.some((r) => sameDay(r.dateDebut, dateDebut))) {
    throw new SettingsRuleError(
      'Une valeur entre déjà en vigueur à cette date : modifiez-la au lieu d’en créer une nouvelle.',
    );
  }
  const previous = [...rows].reverse().find((r) => r.dateDebut < dateDebut) ?? null;
  const next = rows.find((r) => r.dateDebut > dateDebut) ?? null;
  const closePrevious =
    previous && (previous.dateFin === null || previous.dateFin > dateDebut)
      ? { id: previous.id, dateFin: dateDebut }
      : null;
  return { dateFin: next ? next.dateDebut : null, closePrevious };
}

/** Valeur en vigueur à une date : dateDebut <= date < dateFin. */
export function findInForce<T extends Pick<DatedRow, 'dateDebut' | 'dateFin'>>(
  rows: T[],
  date: Date,
): T | null {
  const candidates = rows
    .filter((r) => r.dateDebut <= date && (r.dateFin === null || date < r.dateFin))
    .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
  return candidates[0] ?? null;
}

export interface BracketInput {
  borneMin: number;
  borneMax: number | null;
  taux: number;
}

/**
 * Un barème doit couvrir [0 ; +∞[ sans trou ni chevauchement :
 * première borne à 0, chaque tranche commence où finit la précédente, dernière tranche ouverte.
 */
export function validateBrackets(input: BracketInput[]): string[] {
  const errors: string[] = [];
  if (input.length === 0) return ['Le barème doit contenir au moins une tranche.'];
  const t = [...input].sort((a, b) => a.borneMin - b.borneMin);

  if (t[0].borneMin !== 0) errors.push('La première tranche doit commencer à 0.');
  t.forEach((b, i) => {
    const label = `Tranche ${i + 1}`;
    if (!Number.isFinite(b.taux) || b.taux < 0 || b.taux > 100) {
      errors.push(`${label} : le taux doit être compris entre 0 et 100 %.`);
    }
    const last = i === t.length - 1;
    if (b.borneMax === null) {
      if (!last) errors.push(`${label} : seule la dernière tranche peut être ouverte (sans borne max).`);
    } else {
      if (b.borneMax <= b.borneMin) errors.push(`${label} : la borne max doit être supérieure à la borne min.`);
      if (last) errors.push('La dernière tranche doit être ouverte (sans borne max).');
    }
    if (i > 0) {
      const prev = t[i - 1];
      if (prev.borneMax !== null && b.borneMin > prev.borneMax) {
        errors.push(`${label} : trou entre ${prev.borneMax} et ${b.borneMin}.`);
      } else if (prev.borneMax !== null && b.borneMin < prev.borneMax) {
        errors.push(`${label} : chevauche la tranche précédente.`);
      }
    }
  });
  return errors;
}

/** Codes calculés par le moteur, jamais stockés comme paramètres. */
export const AGGREGATE_CODES = new Set(['BRUT', 'BRUT_IMPOSABLE', 'BRUT_CNSS', 'NET_IMPOSABLE', 'TAUX_HORAIRE']);

/** Paramètres utilisés implicitement par le moteur selon la base ou la rubrique. */
const IMPLICIT_BY_BASE: Record<string, string[]> = { TAUX_HORAIRE: ['HEURES_MOIS'] };
const IMPLICIT_BY_RULE: Record<string, string[]> = {
  ABS_NON_PAYEE: ['BASE_JOURS_MOIS'],
  IRPP: ['ABATTEMENT_FRAIS_PRO'],
};

export interface RuleRefs {
  code: string;
  baseCode: string | null;
  tauxSalarialCode: string | null;
  tauxPatronalCode: string | null;
  plafondCode: string | null;
  baremeCode: string | null;
}

/** Paramètres (code → rubriques qui l'utilisent) requis par les rubriques actives. */
export function requiredParameters(rules: RuleRefs[]): Map<string, string[]> {
  const ruleCodes = new Set(rules.map((r) => r.code));
  const needed = new Map<string, string[]>();
  const add = (param: string | null, rule: string) => {
    if (!param || AGGREGATE_CODES.has(param) || ruleCodes.has(param)) return;
    needed.set(param, [...(needed.get(param) ?? []), rule]);
  };
  for (const r of rules) {
    add(r.tauxSalarialCode, r.code);
    add(r.tauxPatronalCode, r.code);
    add(r.plafondCode, r.code);
    add(r.baseCode, r.code);
    for (const p of r.baseCode ? IMPLICIT_BY_BASE[r.baseCode] ?? [] : []) add(p, r.code);
    for (const p of IMPLICIT_BY_RULE[r.code] ?? []) add(p, r.code);
  }
  return needed;
}

export type ParameterIssue = 'absent' | 'a_confirmer';

/** Même règle que le moteur : 0 est valide (ex. « pas de plafond ») ; seuls l'absence et « À CONFIRMER » bloquent. */
export function parameterIssue(
  row: { valeur: number; description: string | null } | null,
): ParameterIssue | null {
  if (!row) return 'absent';
  if (row.description && /[àa]\s*confirmer/i.test(row.description)) return 'a_confirmer';
  return null;
}

export const EMPLOYEUR_CHAMPS_OBLIGATOIRES = [
  'raisonSociale',
  'adresse',
  'niu',
  'rccm',
  'numeroCnssEmployeur',
] as const;
