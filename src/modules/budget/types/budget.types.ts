import { Prisma } from '@prisma/client';

export const enveloppeWithCountInclude = {
  _count: {
    select: {
      depenses: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.BudgetEnveloppeInclude;

export type EnveloppeWithCount = Prisma.BudgetEnveloppeGetPayload<{
  include: typeof enveloppeWithCountInclude;
}>;

const userResume = { select: { id: true, nom: true, prenom: true, role: true } } as const;

export const depenseWithRelationsInclude = {
  enveloppe: { select: { id: true, libelle: true, annee: true, statut: true } },
  categorie: { select: { id: true, code: true, libelle: true, compteSyscohada: true } },
  fournisseurRef: { select: { id: true, nom: true, niu: true } },
  demandeur: userResume,
  _count: { select: { piecesJointes: true } },
} satisfies Prisma.BudgetDepenseInclude;

export type DepenseWithRelations = Prisma.BudgetDepenseGetPayload<{
  include: typeof depenseWithRelationsInclude;
}>;

export const depenseDetailInclude = {
  ...depenseWithRelationsInclude,
  valideurN1: userResume,
  valideur: userResume,
  payeur: userResume,
  piecesJointes: { orderBy: { createdAt: 'asc' } },
  historique: {
    orderBy: { createdAt: 'asc' },
    include: { user: userResume },
  },
} satisfies Prisma.BudgetDepenseInclude;

export type DepenseDetail = Prisma.BudgetDepenseGetPayload<{
  include: typeof depenseDetailInclude;
}>;

export interface DepensesPage {
  items: DepenseWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export type AlerteBudgetLabel = 'ok' | 'seuil' | 'depasse';

export interface BudgetSyntheseResponse {
  annee: number;
  totaux: {
    prevu: number;
    engage: number;
    realise: number;
    disponible: number;
    en_attente: number;
    taux: number;
  };
  par_enveloppe: Array<{
    id: number;
    libelle: string;
    departement: string | null;
    statut: string;
    annee: number;
    prevu: number;
    engage: number;
    realise: number;
    en_attente: number;
    disponible: number;
    taux: number;
    seuil_alerte_pct: number;
    bloquer_depassement: boolean;
    alerte: AlerteBudgetLabel;
  }>;
  par_categorie: Array<{
    id: number | null;
    code: string | null;
    libelle: string;
    compte_syscohada: string | null;
    realise: number;
    engage: number;
  }>;
  depenses_par_mois: Array<{ mois: string; realise: number; engage: number }>;
  top_fournisseurs: Array<{ id: number | null; nom: string; total: number }>;
}
