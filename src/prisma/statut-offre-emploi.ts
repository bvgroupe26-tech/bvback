/** Miroir de l’enum Prisma `StatutOffreEmploi` (prisma/schema.prisma). */
export const STATUT_OFFRE_EMPLOI = {
  ouverte: 'ouverte',
  fermee: 'fermee',
  pourvue: 'pourvue',
} as const;

export type StatutOffreEmploi =
  (typeof STATUT_OFFRE_EMPLOI)[keyof typeof STATUT_OFFRE_EMPLOI];
 