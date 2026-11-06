import { ConflictException } from '@nestjs/common';
import { StatutPaie, StatutPeriodePaie } from '@prisma/client';

export type PeriodeAction = 'calculer' | 'valider' | 'payer' | 'cloturer' | 'variables';

// Le statut de période est déduit des bulletins : on peut calculer, valider ou payer un employé à la fois.
// Un nouveau bulletin calculé ramène la période à « calculee » ; payer reste possible tant que des
// bulletins validés attendent, même si d'autres sont encore en cours de calcul.
const ALLOWED_FROM: Record<PeriodeAction, StatutPeriodePaie[]> = {
  variables: [StatutPeriodePaie.ouverte, StatutPeriodePaie.calculee, StatutPeriodePaie.validee, StatutPeriodePaie.payee],
  calculer: [StatutPeriodePaie.ouverte, StatutPeriodePaie.calculee, StatutPeriodePaie.validee, StatutPeriodePaie.payee],
  valider: [StatutPeriodePaie.calculee],
  payer: [StatutPeriodePaie.calculee, StatutPeriodePaie.validee],
  cloturer: [StatutPeriodePaie.payee],
};

const ACTION_LABELS: Record<PeriodeAction, string> = {
  variables: 'modifier les variables',
  calculer: 'calculer la paie',
  valider: 'valider les bulletins',
  payer: 'payer les bulletins',
  cloturer: 'clôturer',
};

/** Refuse toute action incompatible avec l'étape de la période (clôturée = lecture seule). */
export function assertPeriodeAction(statut: StatutPeriodePaie, action: PeriodeAction): void {
  if (statut === StatutPeriodePaie.cloturee) {
    throw new ConflictException('Période clôturée : plus aucune écriture possible.');
  }
  if (!ALLOWED_FROM[action].includes(statut)) {
    throw new ConflictException(`Impossible de ${ACTION_LABELS[action]} : la période est « ${statut} ».`);
  }
}

/** Un bulletin v2 n'est plus recalculé une fois validé. */
export function isRecalculable(statut: StatutPaie): boolean {
  return statut === StatutPaie.brouillon || statut === StatutPaie.calcule;
}

/** Numéro unique et stable : dérivé de l'id du bulletin. */
export function buildNumero(annee: number, mois: number | string, id: number): string {
  return `BV-${annee}-${String(Number(mois)).padStart(2, '0')}-${String(id).padStart(6, '0')}`;
}

/** Statut de période déduit des bulletins actifs (hors annulés). */
export function nextPeriodeStatut(
  current: StatutPeriodePaie,
  bulletinStatuts: StatutPaie[],
): StatutPeriodePaie {
  const actifs = bulletinStatuts.filter((s) => s !== StatutPaie.annule);
  if (actifs.length === 0) return current;
  if (actifs.every((s) => s === StatutPaie.paye)) return StatutPeriodePaie.payee;
  if (actifs.every((s) => s === StatutPaie.valide || s === StatutPaie.paye)) return StatutPeriodePaie.validee;
  return StatutPeriodePaie.calculee;
}

type Num = { toString(): string } | number | null | undefined;
const n = (v: Num): number => (v == null ? 0 : Number(v.toString()));

export interface CompteurRow {
  statut: StatutPaie;
  brut: Num;
  netAPayer: Num;
  totalCotisPat: Num;
}

export function computeCompteurs(rows: CompteurRow[]) {
  const c = {
    total: rows.length,
    brouillon: 0,
    calcule: 0,
    valide: 0,
    paye: 0,
    annule: 0,
    masseBrute: 0,
    masseNette: 0,
    chargesPatronales: 0,
  };
  for (const r of rows) {
    if (r.statut in c) (c as Record<string, number>)[r.statut]++;
    if (r.statut === StatutPaie.annule) continue;
    c.masseBrute += n(r.brut);
    c.masseNette += n(r.netAPayer);
    c.chargesPatronales += n(r.totalCotisPat);
  }
  return c;
}

export interface LineLike {
  payRuleId: number | null;
  code: string;
  libelle: string;
  ordre: number;
  type: import('@prisma/client').TypeRubrique;
  base: Num;
  taux: Num;
  quantite: Num;
  montantSalarial: Num;
  montantPatronal: Num;
  imposable: boolean;
}

/** Lignes d'un contre-bulletin : mêmes rubriques, montants opposés. */
export function negateLines<T extends LineLike>(lines: T[]) {
  return lines.map((l) => ({
    payRuleId: l.payRuleId,
    code: l.code,
    libelle: l.libelle,
    ordre: l.ordre,
    type: l.type,
    base: l.base == null ? null : -n(l.base),
    taux: l.taux == null ? null : n(l.taux),
    quantite: l.quantite == null ? null : n(l.quantite),
    montantSalarial: -n(l.montantSalarial),
    montantPatronal: -n(l.montantPatronal),
    imposable: l.imposable,
  }));
}

export function negate(v: Num): number | null {
  return v == null ? null : -n(v);
}
