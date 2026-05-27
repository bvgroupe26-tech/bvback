import { Prisma } from '@prisma/client';

export const paieWithEmployeInclude = {
  employe: {
    select: {
      nom: true,
      prenom: true,
      poste: true,
      departement: true,
    },
  },
} satisfies Prisma.PaieInclude;

export type PaieWithEmploye = Prisma.PaieGetPayload<{
  include: typeof paieWithEmployeInclude;
}>;

export interface GeneratePaieResult {
  generated: number;
  skipped: number;
  bulletins: PaieWithEmploye[];
}

export interface PaieStatsResponse {
  total: number;
  enAttente: number;
  paye: number;
  annule: number;
  masseSalarialeNet: number;
  masseSalarialeBrut: number;
}

export interface PaieEvolutionPoint {
  mois: string;
  annee: number;
  masseSalariale: number;
}
