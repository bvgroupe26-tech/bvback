import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StatutBudgetDepense, UserRole } from '@prisma/client';

const S = StatutBudgetDepense;

export type DepenseAction =
  | 'soumettre'
  | 'valider'
  | 'refuser'
  | 'payer'
  | 'annuler';

export type AlerteBudget = 'ok' | 'seuil' | 'depasse';

/** Statuts qui consomment le budget : engagé (validee_n1, validee) + réalisé (payee). */
export const STATUTS_ENGAGES: StatutBudgetDepense[] = [S.validee_n1, S.validee];
export const STATUTS_REALISES: StatutBudgetDepense[] = [S.payee];
export const STATUTS_CONSOMMES: StatutBudgetDepense[] = [
  ...STATUTS_ENGAGES,
  ...STATUTS_REALISES,
];
export const STATUTS_MODIFIABLES: StatutBudgetDepense[] = [S.brouillon, S.refusee];

const VALIDEURS_N1: UserRole[] = [UserRole.manager, UserRole.rh, UserRole.admin];
const PAYEURS: UserRole[] = [UserRole.rh, UserRole.admin];
const GESTIONNAIRES: UserRole[] = [UserRole.rh, UserRole.admin];

export interface Acteur {
  id: number;
  role: UserRole;
}

export interface DepenseEtat {
  statut: StatutBudgetDepense;
  demandeurId: number | null;
  valideurN1Id: number | null;
  montantTtc: number;
}

export function n2Requis(montantTtc: number, seuilValidationN2: number): boolean {
  return seuilValidationN2 > 0 && montantTtc > seuilValidationN2;
}

export function estGestionnaire(role: UserRole): boolean {
  return GESTIONNAIRES.includes(role);
}

function assertPasSoi(acteur: Acteur, depense: DepenseEtat, verbe: string): void {
  if (depense.demandeurId !== null && depense.demandeurId === acteur.id) {
    throw new ForbiddenException(
      `Vous ne pouvez pas ${verbe} votre propre dépense : elle doit être traitée par un autre valideur.`,
    );
  }
}

function transitionInterdite(statut: StatutBudgetDepense, action: DepenseAction): never {
  throw new ConflictException(
    `Action « ${action} » impossible sur une dépense au statut « ${statut} ».`,
  );
}

/**
 * Applique la machine à états : vérifie droits, séparation des pouvoirs et transition,
 * puis renvoie le statut cible.
 */
export function resoudreTransition(
  action: DepenseAction,
  depense: DepenseEtat,
  acteur: Acteur,
  seuilValidationN2: number,
): StatutBudgetDepense {
  const { statut } = depense;

  switch (action) {
    case 'soumettre': {
      if (statut !== S.brouillon) transitionInterdite(statut, action);
      const estDemandeur = depense.demandeurId === acteur.id;
      if (!estDemandeur && !estGestionnaire(acteur.role)) {
        throw new ForbiddenException('Seul le demandeur peut soumettre cette dépense.');
      }
      return S.soumise;
    }

    case 'valider': {
      assertPasSoi(acteur, depense, 'valider');
      if (statut === S.soumise) {
        if (!VALIDEURS_N1.includes(acteur.role)) {
          throw new ForbiddenException('Rôle insuffisant pour valider cette dépense.');
        }
        return n2Requis(depense.montantTtc, seuilValidationN2) ? S.validee_n1 : S.validee;
      }
      if (statut === S.validee_n1) {
        if (acteur.role !== UserRole.admin) {
          throw new ForbiddenException(
            'La validation de niveau 2 est réservée à un administrateur.',
          );
        }
        if (depense.valideurN1Id === acteur.id) {
          throw new ForbiddenException(
            'La validation de niveau 2 doit être faite par une autre personne que le valideur de niveau 1.',
          );
        }
        return S.validee;
      }
      return transitionInterdite(statut, action);
    }

    case 'refuser': {
      assertPasSoi(acteur, depense, 'refuser');
      if (statut === S.soumise) {
        if (!VALIDEURS_N1.includes(acteur.role)) {
          throw new ForbiddenException('Rôle insuffisant pour refuser cette dépense.');
        }
        return S.refusee;
      }
      if (statut === S.validee_n1) {
        if (acteur.role !== UserRole.admin) {
          throw new ForbiddenException(
            'Seul un administrateur peut refuser une dépense en attente de validation N2.',
          );
        }
        return S.refusee;
      }
      return transitionInterdite(statut, action);
    }

    case 'payer': {
      assertPasSoi(acteur, depense, 'payer');
      if (statut !== S.validee) transitionInterdite(statut, action);
      if (!PAYEURS.includes(acteur.role)) {
        throw new ForbiddenException('Seuls les rôles RH et administrateur peuvent payer.');
      }
      return S.payee;
    }

    case 'annuler': {
      const annulables: StatutBudgetDepense[] = [
        S.brouillon,
        S.soumise,
        S.validee_n1,
        S.validee,
      ];
      if (!annulables.includes(statut)) transitionInterdite(statut, action);
      const estDemandeur = depense.demandeurId === acteur.id;
      const demandeurPeut =
        estDemandeur && (statut === S.brouillon || statut === S.soumise);
      if (!demandeurPeut && !estGestionnaire(acteur.role)) {
        throw new ForbiddenException(
          'Seuls RH et administrateur peuvent annuler une dépense déjà validée.',
        );
      }
      return S.annulee;
    }
  }
}

export interface ControleSoumissionInput {
  enveloppe: {
    statut: string;
    annee: number;
    montantPrevu: number;
    bloquerDepassement: boolean;
    seuilAlertePct: number;
  };
  dateDepense: Date;
  montantTtc: number;
  /** Somme TTC engagée + réalisée sur l'enveloppe, hors dépense courante. */
  consommeHorsDepense: number;
  nbPiecesJointes: number;
  seuilJustificatif: number;
  periodeCloseJusquau: Date | null;
}

export function assertPeriodeOuverte(
  dateDepense: Date,
  periodeCloseJusquau: Date | null,
): void {
  if (periodeCloseJusquau && dateDepense.getTime() <= periodeCloseJusquau.getTime()) {
    const fin = periodeCloseJusquau.toISOString().slice(0, 10);
    throw new BadRequestException(
      `La période comptable est clôturée jusqu'au ${fin} : aucune dépense ne peut y être enregistrée.`,
    );
  }
}

export function calculerAlerte(
  consomme: number,
  prevu: number,
  seuilAlertePct: number,
): AlerteBudget {
  if (prevu <= 0) return consomme > 0 ? 'depasse' : 'ok';
  const pct = (consomme / prevu) * 100;
  if (pct > 100) return 'depasse';
  if (pct >= seuilAlertePct) return 'seuil';
  return 'ok';
}

/** Contrôles bloquants à la soumission ; renvoie l'alerte de consommation à afficher. */
export function controlerSoumission(input: ControleSoumissionInput): AlerteBudget {
  const { enveloppe } = input;

  if (enveloppe.statut !== 'actif') {
    throw new BadRequestException(
      "L'enveloppe budgétaire n'est pas active : choisissez une enveloppe ouverte.",
    );
  }

  const anneeDepense = input.dateDepense.getUTCFullYear();
  if (anneeDepense !== enveloppe.annee) {
    throw new BadRequestException(
      `La dépense est datée de ${anneeDepense} mais l'enveloppe couvre l'exercice ${enveloppe.annee}.`,
    );
  }

  if (
    input.seuilJustificatif > 0 &&
    input.montantTtc >= input.seuilJustificatif &&
    input.nbPiecesJointes === 0
  ) {
    throw new BadRequestException(
      `Une pièce justificative est obligatoire pour une dépense de ${input.seuilJustificatif} FCFA ou plus.`,
    );
  }

  assertPeriodeOuverte(input.dateDepense, input.periodeCloseJusquau);

  return controlerDepassement(input);
}

export function controlerDepassement(
  input: Pick<ControleSoumissionInput, 'enveloppe' | 'montantTtc' | 'consommeHorsDepense'>,
): AlerteBudget {
  const apres = input.consommeHorsDepense + input.montantTtc;
  const prevu = input.enveloppe.montantPrevu;
  if (input.enveloppe.bloquerDepassement && apres > prevu) {
    throw new ConflictException(
      `Dépassement de l'enveloppe refusé : ${apres} FCFA engagés pour ${prevu} FCFA prévus.`,
    );
  }
  return calculerAlerte(apres, prevu, input.enveloppe.seuilAlertePct);
}

/** Montants calculés serveur ; FCFA sans centimes, arrondi au franc. */
export function calculerMontants(
  montantHt: number,
  tauxTva: number,
): { montantHt: number; tauxTva: number; montantTva: number; montantTtc: number } {
  const ht = Math.round(montantHt);
  const tva = Math.round((ht * tauxTva) / 100);
  return { montantHt: ht, tauxTva, montantTva: tva, montantTtc: ht + tva };
}
