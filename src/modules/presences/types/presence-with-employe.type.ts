import { Prisma } from '@prisma/client';

export const presenceWithEmployeInclude = {
  employe: {
    select: {
      nom: true,
      prenom: true,
      departement: true,
      poste: true,
    },
  },
} satisfies Prisma.PresenceInclude;

export type PresenceWithEmploye = Prisma.PresenceGetPayload<{
  include: typeof presenceWithEmployeInclude;
}>;

export interface PresencesStatsResponse {
  total: number;
  presents: number;
  absents: number;
  retards: number;
  conges: number;
  missions: number;
  tauxPresence: string;
  heuresSupplementairesTotales: number;
}
