import { Employe, StatutEmploye } from '@prisma/client';
import { monthBoundsUTC, parseDateOnly } from '../../common/utils/date.util';

export type PaieSkipReason =
  | 'deja_existant'
  | 'statut_inactif'
  | 'statut_suspendu'
  | 'non_embauche'
  | 'depart_avant_periode'
  | 'salaire_zero';

export interface PaieEligibilityResult {
  eligible: boolean;
  reason?: Exclude<PaieSkipReason, 'deja_existant'>;
  message?: string;
  joursTravailles?: number;
  joursPeriode?: number;
  tauxProrata?: number;
}

export interface PaieSkipSummary {
  deja_existant: number;
  statut_inactif: number;
  statut_suspendu: number;
  non_embauche: number;
  depart_avant_periode: number;
  salaire_zero: number;
}

export interface ProratedPaieAmounts {
  salaireBase: number;
  primeTransport: number;
  primeLogement: number;
  primePerformance: number;
  autresPrimes: number;
  joursTravailles: number;
  joursPeriode: number;
  tauxProrata: number;
}

export function createEmptyPaieSkipSummary(): PaieSkipSummary {
  return {
    deja_existant: 0,
    statut_inactif: 0,
    statut_suspendu: 0,
    non_embauche: 0,
    depart_avant_periode: 0,
    salaire_zero: 0,
  };
}

/** Jour civil d'une date « jour » stockée à minuit UTC. */
export function startOfDay(date: Date): Date {
  return parseDateOnly(date);
}

export function getPaiePeriodBounds(
  mois: string,
  annee: number,
): { start: Date; end: Date } {
  return monthBoundsUTC(annee, parseInt(mois, 10));
}

export function computePaiePeriodOverlap(
  employe: Pick<Employe, 'dateEmbauche' | 'dateFinContrat'>,
  mois: string,
  annee: number,
): {
  hasOverlap: boolean;
  joursTravailles: number;
  joursPeriode: number;
  tauxProrata: number;
} {
  const { start: periodStart, end: periodEnd } = getPaiePeriodBounds(
    mois,
    annee,
  );
  const joursPeriode = periodEnd.getUTCDate();

  let effectiveStart = periodStart;
  let effectiveEnd = periodEnd;

  if (employe.dateEmbauche) {
    const embauche = startOfDay(new Date(employe.dateEmbauche));
    if (embauche > periodEnd) {
      return {
        hasOverlap: false,
        joursTravailles: 0,
        joursPeriode,
        tauxProrata: 0,
      };
    }
    if (embauche > effectiveStart) {
      effectiveStart = embauche;
    }
  }

  if (employe.dateFinContrat) {
    const fin = startOfDay(new Date(employe.dateFinContrat));
    if (fin < periodStart) {
      return {
        hasOverlap: false,
        joursTravailles: 0,
        joursPeriode,
        tauxProrata: 0,
      };
    }
    if (fin < effectiveEnd) {
      effectiveEnd = fin;
    }
  }

  if (effectiveStart > effectiveEnd) {
    return {
      hasOverlap: false,
      joursTravailles: 0,
      joursPeriode,
      tauxProrata: 0,
    };
  }

  const joursTravailles =
    Math.floor(
      (effectiveEnd.getTime() - effectiveStart.getTime()) / 86_400_000,
    ) + 1;
  const tauxProrata = joursTravailles / joursPeriode;

  return {
    hasOverlap: true,
    joursTravailles,
    joursPeriode,
    tauxProrata,
  };
}

export function applyPaieProrata(amount: number, tauxProrata: number): number {
  return Math.round(amount * tauxProrata);
}

export function buildProratedPaieAmounts(
  employe: Pick<
    Employe,
    | 'salaireBase'
    | 'defPrimeTransport'
    | 'defPrimeLogement'
    | 'defPrimePerformance'
    | 'defAutresPrimes'
    | 'dateEmbauche'
    | 'dateFinContrat'
  >,
  mois: string,
  annee: number,
): ProratedPaieAmounts {
  const overlap = computePaiePeriodOverlap(employe, mois, annee);
  const taux = overlap.tauxProrata;

  return {
    salaireBase: applyPaieProrata(employe.salaireBase, taux),
    primeTransport: applyPaieProrata(employe.defPrimeTransport, taux),
    primeLogement: applyPaieProrata(employe.defPrimeLogement, taux),
    primePerformance: applyPaieProrata(employe.defPrimePerformance, taux),
    autresPrimes: applyPaieProrata(employe.defAutresPrimes, taux),
    joursTravailles: overlap.joursTravailles,
    joursPeriode: overlap.joursPeriode,
    tauxProrata: taux,
  };
}

/**
 * Détermine si un employé peut recevoir un bulletin auto-généré pour une période.
 * Gère embauche en cours de mois, départ (dateFinContrat) et prorata.
 */
export function checkPaieEligibility(
  employe: Pick<
    Employe,
    | 'statut'
    | 'salaireBase'
    | 'dateEmbauche'
    | 'dateFinContrat'
    | 'deletedAt'
  >,
  mois: string,
  annee: number,
): PaieEligibilityResult {
  if (employe.deletedAt) {
    return {
      eligible: false,
      reason: 'statut_inactif',
      message: 'Employé archivé',
    };
  }

  if (employe.statut === StatutEmploye.suspendu) {
    return {
      eligible: false,
      reason: 'statut_suspendu',
      message: 'Employé suspendu — bulletin non généré automatiquement',
    };
  }

  if (employe.salaireBase <= 0) {
    return {
      eligible: false,
      reason: 'salaire_zero',
      message: 'Salaire de base non renseigné ou nul',
    };
  }

  if (employe.statut === StatutEmploye.inactif) {
    if (!employe.dateFinContrat) {
      return {
        eligible: false,
        reason: 'statut_inactif',
        message:
          'Employé inactif sans date de fin de contrat — renseignez dateFinContrat pour le dernier mois',
      };
    }
  } else if (employe.statut !== StatutEmploye.actif) {
    return {
      eligible: false,
      reason: 'statut_inactif',
      message: `Statut RH « ${employe.statut} » incompatible avec la paie automatique`,
    };
  }

  const overlap = computePaiePeriodOverlap(employe, mois, annee);

  if (!overlap.hasOverlap) {
    if (employe.dateEmbauche) {
      const embauche = startOfDay(new Date(employe.dateEmbauche));
      const { end: periodEnd } = getPaiePeriodBounds(mois, annee);
      if (embauche > periodEnd) {
        return {
          eligible: false,
          reason: 'non_embauche',
          message: `Embauché le ${embauche.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} — hors période ${mois}/${annee}`,
        };
      }
    }

    if (employe.dateFinContrat) {
      const fin = startOfDay(new Date(employe.dateFinContrat));
      const { start: periodStart } = getPaiePeriodBounds(mois, annee);
      if (fin < periodStart) {
        return {
          eligible: false,
          reason: 'depart_avant_periode',
          message: `Contrat terminé le ${fin.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} — avant ${mois}/${annee}`,
        };
      }
    }

    return {
      eligible: false,
      reason: 'statut_inactif',
      message: 'Aucun jour travaillé sur la période',
    };
  }

  return {
    eligible: true,
    joursTravailles: overlap.joursTravailles,
    joursPeriode: overlap.joursPeriode,
    tauxProrata: overlap.tauxProrata,
  };
}
