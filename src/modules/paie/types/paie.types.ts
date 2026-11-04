import { Prisma } from '@prisma/client';

export const paieWithEmployeInclude = {
  employe: {
    select: {
      nom: true,
      prenom: true,
      poste: true,
      departement: true,
      matricule: true,
    },
  },
} satisfies Prisma.PaieInclude;

export type PaieWithEmploye = Prisma.PaieGetPayload<{
  include: typeof paieWithEmployeInclude;
}>;

/** Détail : lignes (moteur v2), snapshots et cumuls sont des champs scalaires inclus d'office. */
export const paieDetailInclude = {
  ...paieWithEmployeInclude,
  lignes: { orderBy: [{ ordre: 'asc' }, { code: 'asc' }] },
  period: { select: { id: true, statut: true } },
  annuleBulletin: { select: { id: true, numero: true } },
  contreBulletins: { where: { deletedAt: null }, select: { id: true, numero: true } },
} satisfies Prisma.PaieInclude;

export type PaieDetail = Prisma.PaieGetPayload<{ include: typeof paieDetailInclude }>;

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
