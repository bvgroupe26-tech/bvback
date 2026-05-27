/** Miroir de l’enum Prisma `SituationFamiliale` (prisma/schema.prisma). */
export const SITUATION_FAMILIALE = {
  celibataire: 'celibataire',
  marie: 'marie',
  divorce: 'divorce',
  veuf: 'veuf',
} as const;

export type SituationFamiliale =
  (typeof SITUATION_FAMILIALE)[keyof typeof SITUATION_FAMILIALE];
