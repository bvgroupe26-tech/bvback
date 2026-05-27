/** Miroir de l’enum Prisma `TypeContratOffre` (prisma/schema.prisma). */
export const TYPE_CONTRAT_OFFRE = {
  CDI: 'CDI',
  CDD: 'CDD',
  Stage: 'Stage',
  Freelance: 'Freelance',
} as const;

export type TypeContratOffre =
  (typeof TYPE_CONTRAT_OFFRE)[keyof typeof TYPE_CONTRAT_OFFRE];
