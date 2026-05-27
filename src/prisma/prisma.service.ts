import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from './prisma-client';

const SOFT_DELETE_MODELS = new Set([
  'User',
  'Employe',
  'Presence',
  'Absence',
  'Paie',
  'OffreEmploi',
  'Candidature',
  'Competence',
  'Formation',
  'Evaluation',
  'ActiviteLog',
  'BudgetCategorie',
  'BudgetEnveloppe',
  'BudgetDepense',
  'DocumentRh',
  'Notification',
]);

function withActiveOnly(
  where: unknown,
  uniqueOp = false,
): Record<string, unknown> {
  if (where === undefined || where === null) {
    return { deletedAt: null };
  }
  if (typeof where !== 'object' || Array.isArray(where)) {
    return { AND: [{ deletedAt: null }, where as object] };
  }
  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, 'deletedAt')) {
    return w;
  }
  if (uniqueOp) {
    return { ...w, deletedAt: null };
  }
  return { AND: [{ deletedAt: null }, w] };
}

/** Client Prisma avec filtre deletedAt sur lectures / mises à jour (Prisma 6 : $extends). */
export function createPrismaClientWithSoftDelete(): PrismaClient {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }
          const ops = new Set([
            'findMany',
            'findFirst',
            'findUnique',
            'count',
            'aggregate',
            'groupBy',
            'update',
            'updateMany',
            'upsert',
          ]);
          if (!ops.has(operation)) {
            return query(args);
          }
          const uniqueOps = new Set(['findUnique', 'update', 'upsert']);
          const nextArgs = { ...(args as Record<string, unknown>) };
          nextArgs.where = withActiveOnly(nextArgs.where, uniqueOps.has(operation));
          return query(nextArgs);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** Jeton d’injection — l’instance réelle vient de `prismaServiceProvider`. */
export class PrismaService extends PrismaClient {}

export const prismaServiceProvider = {
  provide: PrismaService,
  useFactory: (): PrismaClient => createPrismaClientWithSoftDelete(),
};

@Injectable()
export class PrismaLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
