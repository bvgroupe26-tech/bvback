import { Absence, Employe, StatutAbsence, TypeAbsence } from '@prisma/client';
import {
  countBusinessDays,
  currentLocalYear,
  yearBoundsUTC,
} from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';

/** Droit annuel en jours ouvrés — règle à confirmer côté métier. */
export const ANNUAL_LEAVE_DAYS = 30;

type DateRange = Pick<Absence, 'dateDebut' | 'dateFin'>;

/** Jours ouvrés d'une absence, éventuellement limités à une année civile. */
export function absenceBusinessDays(absence: DateRange, year?: number): number {
  if (year === undefined) {
    return countBusinessDays(absence.dateDebut, absence.dateFin);
  }
  const { start, end } = yearBoundsUTC(year);
  const debut = absence.dateDebut > start ? absence.dateDebut : start;
  const fin = absence.dateFin < end ? absence.dateFin : end;
  return fin < debut ? 0 : countBusinessDays(debut, fin);
}

/** Droit au prorata des mois restants l'année de l'embauche. */
export function annualEntitlement(
  employe: Pick<Employe, 'dateEmbauche'>,
  year: number,
): number {
  const embauche = employe.dateEmbauche;
  if (!embauche || embauche.getUTCFullYear() < year) return ANNUAL_LEAVE_DAYS;
  if (embauche.getUTCFullYear() > year) return 0;
  const moisRestants = 12 - embauche.getUTCMonth();
  return Math.round((ANNUAL_LEAVE_DAYS * moisRestants) / 12);
}

export interface LeaveBalance {
  annee: number;
  droitAnnuel: number;
  joursPris: number;
  congesPayesPris: number;
  enAttente: number;
  soldeRestant: number;
  detailParType: Record<string, number>;
}

export async function computeLeaveBalance(
  prisma: PrismaService,
  employe: Pick<Employe, 'id' | 'dateEmbauche'>,
  year: number = currentLocalYear(),
  excludeAbsenceId?: number,
): Promise<LeaveBalance> {
  const { start, end } = yearBoundsUTC(year);

  const absences = await prisma.absence.findMany({
    where: {
      employeId: employe.id,
      statut: { in: [StatutAbsence.approuve, StatutAbsence.en_attente] },
      dateDebut: { lte: end },
      dateFin: { gte: start },
      ...(excludeAbsenceId ? { id: { not: excludeAbsenceId } } : {}),
    },
  });

  const detailParType: Record<string, number> = {};
  let joursPris = 0;
  let congesPayesPris = 0;
  let enAttente = 0;

  for (const absence of absences) {
    const jours = absenceBusinessDays(absence, year);
    if (absence.statut === StatutAbsence.en_attente) {
      if (absence.typeAbsence === TypeAbsence.conge_paye) enAttente += jours;
      continue;
    }
    joursPris += jours;
    detailParType[absence.typeAbsence] = (detailParType[absence.typeAbsence] ?? 0) + jours;
    if (absence.typeAbsence === TypeAbsence.conge_paye) congesPayesPris += jours;
  }

  const droitAnnuel = annualEntitlement(employe, year);

  return {
    annee: year,
    droitAnnuel,
    joursPris,
    congesPayesPris,
    enAttente,
    soldeRestant: Math.max(0, droitAnnuel - congesPayesPris),
    detailParType,
  };
}
