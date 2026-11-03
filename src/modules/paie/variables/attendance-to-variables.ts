import Decimal from 'decimal.js';
import { addDays, countBusinessDays, parseDateOnly } from '../../../common/utils/date.util';

export type AttendanceRuleCode = 'HS_1' | 'HS_2' | 'HS_3' | 'ABS_NON_PAYEE';

export interface AttendancePresence {
  employeId: number;
  date: Date;
  statut: string;
  justification?: string | null;
  heuresSupplementaires: number;
}

export interface AttendanceAbsence {
  employeId: number;
  dateDebut: Date;
  dateFin: Date;
  typeAbsence: string;
}

export interface VariableDraft {
  employeId: number;
  ruleCode: AttendanceRuleCode;
  quantite: Decimal;
  source: 'presence' | 'absence';
  commentaire: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date) => parseDateOnly(d).toISOString().slice(0, 10);

/** Lundi (UTC) de la semaine ISO contenant `d`. */
function weekKey(d: Date): string {
  const day = parseDateOnly(d);
  const dow = (day.getUTCDay() + 6) % 7;
  return iso(addDays(day, -dow));
}

/**
 * Transforme présences et absences approuvées d'une période en variables de paie.
 * - HS : dimanche → HS_3 ; sinon, si `seuilTranche1Semaine` est fourni, les N premières heures
 *   de chaque semaine → HS_1 et le surplus → HS_2 ; à défaut tout en HS_1 (avec avertissement).
 * - Jours non payés (ouvrés) : congés sans solde approuvés + absences injustifiées pointées
 *   (statut « absent » sans justification, hors jours couverts par une absence approuvée).
 */
export function buildAttendanceVariables(args: {
  periodeDebut: Date;
  periodeFin: Date;
  presences: AttendancePresence[];
  absencesApprouvees: AttendanceAbsence[];
  seuilTranche1Semaine?: number | null;
}): { variables: VariableDraft[]; warnings: string[] } {
  const debut = parseDateOnly(args.periodeDebut);
  const fin = parseDateOnly(args.periodeFin);
  const dansPeriode = (d: Date) => {
    const x = parseDateOnly(d);
    return x >= debut && x <= fin;
  };
  const seuil = args.seuilTranche1Semaine && args.seuilTranche1Semaine > 0 ? args.seuilTranche1Semaine : null;
  const warnings: string[] = [];
  const variables: VariableDraft[] = [];

  const presencesParEmploye = new Map<number, AttendancePresence[]>();
  for (const p of args.presences) {
    if (!dansPeriode(p.date)) continue;
    const list = presencesParEmploye.get(p.employeId) ?? [];
    list.push(p);
    presencesParEmploye.set(p.employeId, list);
  }

  const joursCouverts = new Map<number, Set<string>>();
  const sansSolde = new Map<number, number>();
  for (const a of args.absencesApprouvees) {
    const start = parseDateOnly(a.dateDebut) > debut ? parseDateOnly(a.dateDebut) : debut;
    const end = parseDateOnly(a.dateFin) < fin ? parseDateOnly(a.dateFin) : fin;
    if (end < start) continue;
    const set = joursCouverts.get(a.employeId) ?? new Set<string>();
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) set.add(iso(new Date(t)));
    joursCouverts.set(a.employeId, set);
    if (a.typeAbsence === 'conge_sans_solde') {
      sansSolde.set(a.employeId, (sansSolde.get(a.employeId) ?? 0) + countBusinessDays(start, end));
    }
  }

  let hsNonVentilees = false;
  for (const [employeId, presences] of presencesParEmploye) {
    const sorted = [...presences].sort((a, b) => a.date.getTime() - b.date.getTime());
    const hs: Record<'HS_1' | 'HS_2' | 'HS_3', Decimal> = {
      HS_1: new Decimal(0),
      HS_2: new Decimal(0),
      HS_3: new Decimal(0),
    };
    const cumulSemaine = new Map<string, Decimal>();
    const injustifiees: string[] = [];

    for (const p of sorted) {
      const heures = new Decimal(p.heuresSupplementaires || 0);
      const jour = parseDateOnly(p.date);
      const dow = jour.getUTCDay();
      if (heures.gt(0)) {
        if (dow === 0) {
          hs.HS_3 = hs.HS_3.plus(heures);
        } else if (seuil) {
          const key = weekKey(jour);
          const deja = cumulSemaine.get(key) ?? new Decimal(0);
          const restantT1 = Decimal.max(0, new Decimal(seuil).minus(deja));
          const t1 = Decimal.min(heures, restantT1);
          hs.HS_1 = hs.HS_1.plus(t1);
          hs.HS_2 = hs.HS_2.plus(heures.minus(t1));
          cumulSemaine.set(key, deja.plus(heures));
        } else {
          hs.HS_1 = hs.HS_1.plus(heures);
          hsNonVentilees = true;
        }
      }

      const estJourOuvre = dow !== 0 && dow !== 6;
      const justifiee = (p.justification ?? '').trim().length > 0;
      if (p.statut === 'absent' && !justifiee && estJourOuvre && !joursCouverts.get(employeId)?.has(iso(jour))) {
        injustifiees.push(iso(jour));
      }
    }

    for (const code of ['HS_1', 'HS_2', 'HS_3'] as const) {
      if (hs[code].gt(0)) {
        variables.push({
          employeId,
          ruleCode: code,
          quantite: hs[code],
          source: 'presence',
          commentaire: `Heures supplémentaires pointées (${code})`,
        });
      }
    }
    if (injustifiees.length) {
      variables.push({
        employeId,
        ruleCode: 'ABS_NON_PAYEE',
        quantite: new Decimal(injustifiees.length),
        source: 'presence',
        commentaire: `Absences injustifiées : ${injustifiees.join(', ')}`,
      });
    }
  }

  for (const [employeId, jours] of sansSolde) {
    if (jours > 0) {
      variables.push({
        employeId,
        ruleCode: 'ABS_NON_PAYEE',
        quantite: new Decimal(jours),
        source: 'absence',
        commentaire: `Congé sans solde : ${jours} jour(s) ouvré(s)`,
      });
    }
  }

  if (hsNonVentilees) {
    warnings.push(
      'Heures supplémentaires non ventilées par tranche (paramètre HS_SEUIL_TRANCHE1_SEMAINE absent) : tout est en HS_1, dimanches en HS_3',
    );
  }
  return { variables, warnings };
}
