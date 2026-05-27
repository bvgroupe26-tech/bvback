import { Prisma } from '@prisma/client';

export const activiteWithEmployeInclude = {
  employe: {
    select: {
      nom: true,
      prenom: true,
    },
  },
} satisfies Prisma.ActiviteLogInclude;

export type ActiviteLogWithEmploye = Prisma.ActiviteLogGetPayload<{
  include: typeof activiteWithEmployeInclude;
}>;
