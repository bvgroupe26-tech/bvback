/** Miroir de l’enum Prisma `TypeContrat` (prisma/schema.prisma). */
export const TYPE_CONTRAT = {
  CDI: 'CDI',
  CDD: 'CDD',
  Stage: 'Stage',
  Freelance: 'Freelance',
  Interim: 'Interim',
} as const;

export type TypeContrat = (typeof TYPE_CONTRAT)[keyof typeof TYPE_CONTRAT];
