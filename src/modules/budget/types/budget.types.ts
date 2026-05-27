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

export const depenseWithRelationsInclude = {
  enveloppe: { select: { libelle: true } },
  categorie: { select: { libelle: true } },
} satisfies Prisma.BudgetDepenseInclude;

export type DepenseWithRelations = Prisma.BudgetDepenseGetPayload<{
  include: typeof depenseWithRelationsInclude;
}>;

export interface BudgetSyntheseResponse {
  annee: number;
  totalPrevu: number;
  totalRealise: number;
  tauxConsommation: string;
  parEnveloppe: Array<{
    id: number;
    libelle: string;
    montantPrevu: number;
    realise: number;
    taux: string;
  }>;
}
