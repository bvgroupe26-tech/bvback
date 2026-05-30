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

import type { PaieSkipReason, PaieSkipSummary } from '../paie-eligibility.util';

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
