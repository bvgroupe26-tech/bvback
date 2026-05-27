/** Miroir de l’enum Prisma `StatutEmploye` (prisma/schema.prisma). */
export const STATUT_EMPLOYE = {
  actif: 'actif',
  inactif: 'inactif',
  suspendu: 'suspendu',
} as const;

export type StatutEmploye = (typeof STATUT_EMPLOYE)[keyof typeof STATUT_EMPLOYE];
