import { Prisma, StatutCandidature } from '@prisma/client';

export const candidatureWithOffreInclude = {
  offre: {
    select: {
      titre: true,
      departement: true,
    },
  },
} satisfies Prisma.CandidatureInclude;

export type CandidatureWithOffre = Prisma.CandidatureGetPayload<{
  include: typeof candidatureWithOffreInclude;
}>;

export type OffreWithCandidaturesCount = Prisma.OffreEmploiGetPayload<{
  include: { _count: { select: { candidatures: true } } };
}>;

export interface OffresStatsResponse {
  totalOffres: number;
  ouvertes: number;
  fermees: number;
  pourvues: number;
  totalCandidatures: number;
  parStatut: Array<{ statut: StatutCandidature; count: number }>;
  tauxConversion: number;
}
