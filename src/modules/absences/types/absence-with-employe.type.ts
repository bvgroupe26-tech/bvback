import { Absence, Prisma } from '@prisma/client';

export const absenceWithEmployeInclude = {
  employe: {
    select: {
      nom: true,
      prenom: true,
      departement: true,
    },
  },
} satisfies Prisma.AbsenceInclude;

export type AbsenceWithEmploye = Prisma.AbsenceGetPayload<{
  include: typeof absenceWithEmployeInclude;
}>;

export type AbsenceDateRange = Pick<Absence, 'dateDebut' | 'dateFin'>;
